// src/server/game/ratingabuse/abusechecks.ts

/**
 * The suspicion heuristics: each weighs one monitored characteristic of a player's
 * recent rated games, and {@link runAll} sums them into a verdict.
 *
 * Every check is pure — it reads the evidence `ratingabuse.ts` gathered and returns
 * a weight, touching no database and sending nothing.
 *
 * Red flags, the implemented ones marked with an X:
 *
 * (X) Games won with most of the player's own clock left unused (indicates no thinking)
 * (X) Opponents use the same IP address. OR The player has no active refresh tokens (logged out mid-game)
 * (X) Many games against always the same opponents
 * (X) Opponent accounts brand new
 * ( ) Win streaks, especially against the same opponents
 * ( ) Rapid improvement over days/weeks that should take months, especially if account new
 * ( ) Low total rated loss count
 * ( ) Opponents have low total casual matches, and low total rated wins
 * ( ) Excessive resignation terminations
 * ( ) Cheat reports against them
 */

import type { AbuseEvidence, SuspicionRecord, SuspicionVerdict } from './ratingabusetypes.js';

import timeutil from '../../../shared/util/timeutil.js';

// Constants -------------------------------------------------------------------------------------

/** Total suspicion score which is enough to mark a user as suspicious. */
const SUSPICION_TOTAL_WEIGHT_THRESHHOLD = 1.0;

/** Games won with at least this fraction of the player's own clock still unused have a nonzero suspicion score. */
const SUSPICIOUS_UNUSED_CLOCK_FRACTION = 0.8;

/** Opponents with a younger account age than this count as suspicious. */
const SUSPICIOUS_ACCOUNT_AGE_MILLIS = 1000 * 60 * 60 * 24 * 5; // 5 days

// Verdict ---------------------------------------------------------------------------------------

/** Runs every check over the evidence, and sums their weights into a verdict. */
function runAll(evidence: AbuseEvidence): SuspicionVerdict {
	const records: SuspicionRecord[] = [];

	checkThinkTime(evidence, records);
	checkOpponentSameness(evidence, records);
	checkIPAddresses(evidence, records);
	checkOpponentAccountAge(evidence, records);

	const totalWeight = records.map((entry) => entry.weight).reduce((acc, cur) => acc + cur, 0);

	return {
		records,
		totalWeight,
		suspicious: totalWeight >= SUSPICION_TOTAL_WEIGHT_THRESHHOLD,
	};
}

// Checks ----------------------------------------------------------------------------------------

/**
 * Check if the player won their games without spending their own clock.
 * Low move counts, short server durations and games played back-to-back are all
 * proxies for this same fact, so measuring the clock directly covers all of them,
 * and unlike them it is normalized by the game's time control.
 */
function checkThinkTime(evidence: AbuseEvidence, records: SuspicionRecord[]): void {
	let weight = 0;
	let comment = '';
	for (const gameInfo of evidence.games) {
		if (!gameInfo.elo_change_from_game || gameInfo.elo_change_from_game < 0) continue; // Game is not suspicious if player lost elo from it

		/** The player's own clock budget: their base time, plus the increment earned on their share of the moves. */
		const available_clock_millis =
			1000 *
			(gameInfo.base_time_seconds! +
				0.5 * gameInfo.increment_seconds! * (gameInfo.move_count - 1));
		// Capped, since the halved increment is an average — whoever moved more than their share earns above it.
		const unused_fraction = Math.min(1, gameInfo.finalClockMillis! / available_clock_millis);

		// Game is suspicious if the player barely touched their clock
		if (unused_fraction >= SUSPICIOUS_UNUSED_CLOCK_FRACTION) {
			weight +=
				(unused_fraction - SUSPICIOUS_UNUSED_CLOCK_FRACTION) /
				(1 - SUSPICIOUS_UNUSED_CLOCK_FRACTION); // rescale to [0, 1]
			comment += `In game ${gameInfo.game_id} with time control ${gameInfo.base_time_seconds! / 60}m+${gameInfo.increment_seconds}s, player left ${(100 * unused_fraction).toFixed(0)}% of their clock unused. `;
		}
	}
	if (weight > 0)
		records.push({
			category: 'think_time',
			weight: (weight / evidence.games.length) * 0.8, // Rescale to [0, 0.8]
			comment,
		});
}

/** Check if the user is playing against the same opponents many times. */
function checkOpponentSameness(evidence: AbuseEvidence, records: SuspicionRecord[]): void {
	if (evidence.opponentIds.length === 0) return;

	let weight = 0;
	for (const frequency of Object.values(evidence.opponentFrequency)) {
		// Player is suspicious if he played against the same opponent several times
		if (frequency > 1) weight += frequency ** 2;
	}
	if (weight > 0)
		records.push({
			category: 'same_opponents',
			weight: (weight / evidence.opponentIds.length ** 2) * 0.5, // rescale to [0, 0.5]
		});
}

/** Check if the user is using the same IP address as his opponents. */
function checkIPAddresses(evidence: AbuseEvidence, records: SuspicionRecord[]): void {
	// Player logged out mid game
	if (evidence.ipAddresses.length === 0) {
		records.push({
			category: 'ip_addresses',
			weight: 0.5,
			comment: 'Player logged out mid-game.',
		});
		return;
	} else if (
		evidence.opponentIds.length === 0 ||
		Object.keys(evidence.opponentIpAddresses).length === 0
	)
		return;

	let weight = 0;
	let comment = 'Opponents using same IP address: ';
	for (const user_id in evidence.opponentIpAddresses) {
		// Player is suspicious if he uses a same IP adress as an opponent
		const common_ip_addresses = evidence.ipAddresses.filter((ip_address) =>
			evidence.opponentIpAddresses[user_id]!.includes(ip_address),
		);
		if (common_ip_addresses.length > 0) {
			weight += evidence.opponentFrequency[user_id] ?? 0;
			comment += `${user_id},`;
		}
	}
	if (weight > 0)
		records.push({
			category: 'ip_addresses',
			weight: (weight / evidence.opponentIds.length) * 0.5, // rescale to [0, 0.5]
			comment,
		});
}

/** Check if the user's opponents have newly created accounts. */
function checkOpponentAccountAge(evidence: AbuseEvidence, records: SuspicionRecord[]): void {
	if (evidence.opponentIds.length === 0) return;

	const current_time_millis = Date.now();
	let weight = 0;
	let comment = 'Newly joined opponents: ';
	for (const opponentInfo of evidence.opponents) {
		// Player is suspicious if his opponent's account is less than a week old
		const account_age_millis = Math.max(
			0,
			current_time_millis - timeutil.sqliteToTimestamp(opponentInfo.joined),
		);
		if (account_age_millis < SUSPICIOUS_ACCOUNT_AGE_MILLIS) {
			const fraction = account_age_millis / SUSPICIOUS_ACCOUNT_AGE_MILLIS; // fraction is in the interval [0, 1]
			weight += (1 - fraction) * (evidence.opponentFrequency[opponentInfo.user_id] ?? 0);
			comment += `${opponentInfo.user_id},`;
		}
	}
	if (weight > 0)
		records.push({
			category: 'opponent_account_age',
			weight: (weight / evidence.opponentIds.length) * 0.3, // rescale to [0, 0.3]
			comment,
		});
}

// Exports ---------------------------------------------------------------------------------------

export default {
	runAll,
};
