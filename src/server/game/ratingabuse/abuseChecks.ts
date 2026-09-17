// src/server/game/ratingabuse/abuseChecks.ts

/**
 * The suspicion heuristics: each weighs one monitored characteristic of a player's
 * recent rated games, and {@link runAll} sums them into a verdict.
 *
 * Every check is pure — it reads the evidence `ratingAbuse.ts` gathered and returns
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
 */

import type { AbuseEvidence, SuspicionRecord, SuspicionVerdict } from './ratingAbuseTypes.js';

import timeutil from '../../../shared/util/timeutil.js';

// Constants -------------------------------------------------------------------

/** Total suspicion score which is enough to mark a user as suspicious. */
const SUSPICION_THRESHOLD = 1.0;

/** The most each check can weigh. */
const CHECK_MAX_WEIGHTS = {
	think_time: 0.8,
	same_opponents: 0.5,
	ip_addresses: 0.5,
	logged_out: 0.5,
	opponent_account_age: 0.3,
} as const satisfies Record<SuspicionRecord['category'], number>;

/** Games won with at least this fraction of the player's own clock still unused have a nonzero suspicion score. */
const SUSPICIOUS_UNUSED_CLOCK_FRACTION = 0.8;

/** Opponents with a younger account age than this count as suspicious. */
const SUSPICIOUS_ACCOUNT_AGE_MS = 1000 * 60 * 60 * 24 * 5; // 5 days

// Verdict ---------------------------------------------------------------------

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
		suspicious: totalWeight >= SUSPICION_THRESHOLD,
	};
}

// Checks ----------------------------------------------------------------------

/**
 * Check if the player won their games without spending their own clock.
 * Low move counts, short server durations and games played back-to-back are all
 * proxies for this same fact, so measuring the clock directly covers all of them,
 * and unlike them it is normalized by the game's time control.
 */
function checkThinkTime(evidence: AbuseEvidence, records: SuspicionRecord[]): void {
	let weight = 0;
	for (const gameInfo of evidence.games) {
		if (!gameInfo.elo_change_from_game || gameInfo.elo_change_from_game < 0) continue; // Game is not suspicious if player lost elo from it

		const unused_fraction = gameInfo.unusedClockFraction;

		// Game is suspicious if the player barely touched their clock
		if (unused_fraction >= SUSPICIOUS_UNUSED_CLOCK_FRACTION) {
			weight +=
				(unused_fraction - SUSPICIOUS_UNUSED_CLOCK_FRACTION) /
				(1 - SUSPICIOUS_UNUSED_CLOCK_FRACTION); // rescale to [0, 1]
		}
	}
	if (weight > 0)
		records.push({
			category: 'think_time',
			weight: (weight / evidence.games.length) * CHECK_MAX_WEIGHTS.think_time, // Rescale to [0, max]
		});
}

/** Check if the user is playing against the same opponents many times. */
function checkOpponentSameness(evidence: AbuseEvidence, records: SuspicionRecord[]): void {
	let weight = 0;
	for (const frequency of Object.values(evidence.opponentFrequency)) {
		// Player is suspicious if he played against the same opponent several times
		if (frequency > 1) weight += frequency ** 2;
	}
	if (weight > 0)
		records.push({
			category: 'same_opponents',
			weight: (weight / evidence.games.length ** 2) * CHECK_MAX_WEIGHTS.same_opponents, // rescale to [0, max]
		});
}

/** Check if the user is using the same IP address as his opponents. */
function checkIPAddresses(evidence: AbuseEvidence, records: SuspicionRecord[]): void {
	// Player logged out mid game
	if (evidence.ipAddresses.length === 0) {
		records.push({ category: 'logged_out', weight: CHECK_MAX_WEIGHTS.logged_out });
		return;
	}

	let weight = 0;
	for (const [user_id, sharesIp] of Object.entries(evidence.opponentSharesIp)) {
		// Player is suspicious if he uses a same IP adress as an opponent
		if (sharesIp) weight += evidence.opponentFrequency[Number(user_id)]!;
	}
	if (weight > 0)
		records.push({
			category: 'ip_addresses',
			weight: (weight / evidence.games.length) * CHECK_MAX_WEIGHTS.ip_addresses, // rescale to [0, max]
		});
}

/** Check if the user's opponents have newly created accounts. */
function checkOpponentAccountAge(evidence: AbuseEvidence, records: SuspicionRecord[]): void {
	const current_time_ms = Date.now();
	let weight = 0;
	for (const opponentInfo of evidence.opponents) {
		// Player is suspicious if his opponent's account is less than a week old
		const account_age_ms = Math.max(
			0,
			current_time_ms - timeutil.sqliteToTimestamp(opponentInfo.joined),
		);
		if (account_age_ms < SUSPICIOUS_ACCOUNT_AGE_MS) {
			const fraction = account_age_ms / SUSPICIOUS_ACCOUNT_AGE_MS; // fraction is in the interval [0, 1]
			weight += (1 - fraction) * evidence.opponentFrequency[opponentInfo.user_id]!;
		}
	}
	if (weight > 0)
		records.push({
			category: 'opponent_account_age',
			weight: (weight / evidence.games.length) * CHECK_MAX_WEIGHTS.opponent_account_age, // rescale to [0, max]
		});
}

// Exports ---------------------------------------------------------------------

export default {
	// Constants
	SUSPICION_THRESHOLD,
	CHECK_MAX_WEIGHTS,
	// Verdict
	runAll,
};
