// src/server/game/ratingabuse/ratingabuse.ts

/**
 * Weights a user's probability of rating abuse — repeatedly losing on purpose from an
 * alt account, or aborting games to dodge an elo loss — every few rated games they play.
 *
 * The entry point and the gatherer: it decides who is due for a check and assembles their
 * evidence. `abusechecks.ts` weighs that evidence, and `abusereport.ts` reports the verdict.
 */

import type { Player } from '../../../shared/util/typeutil.js';
import type { ServerGame } from '../gamemanager/servergametypes.js';
import type { GamesRecord } from '../../database/gamesManager.js';
import type { GameConclusion } from '../../../shared/chess/util/typeschemas.js';
import type { RefreshTokenRecord } from '../../database/refreshTokenManager.js';
import type {
	AbuseEvidence,
	AbuseGameInfo,
	AbusePlayerGamesRecord,
	IdentityEvidence,
} from './ratingabusetypes.js';

import clock from '../../../shared/chess/logic/clock.js';
import jsutil from '../../../shared/util/jsutil.js';
import gamerules from '../../../shared/chess/util/gamerules.js';
import clockutil from '../../../shared/chess/util/clockutil.js';
import metadatautil from '../../../shared/chess/util/metadatautil.js';
import icnconverter from '../../../shared/chess/logic/icn/icnconverter.js';
import leaderboardregistry from '../../../shared/chess/variants/leaderboardregistry.js';

import logEvents from '../../utility/logEvents.js';
import abusechecks from './abusechecks.js';
import abusereport from './abusereport.js';
import gameutility from '../gamemanager/gameutility.js';
import gamesManager from '../../database/gamesManager.js';
import memberManager from '../../database/memberManager.js';
import playerGamesManager from '../../database/playerGamesManager.js';
import ratingAbuseManager from '../../database/ratingAbuseManager.js';
import refreshTokenManager from '../../database/refreshTokenManager.js';

// Constants -------------------------------------------------------------------

/** How many games played to measure a player's rating abuse probability at once. */
const GAME_INTERVAL_TO_MEASURE = 5;

// Measurement -----------------------------------------------------------------

/** Monitor suspicion levels for all players who played a particular game in a particular leaderboard. */
function measureAfterGame(servergame: ServerGame): void {
	// Do not monitor suspicion levels, if game was unrated
	if (!servergame.match.rated) return;
	// Skip if the game was aborted (this also covers 0 moves),
	// the game will NOT have added an entry in the leaderboards table for the players!
	if (servergame.gameConclusion!.victor === undefined) return;

	// Do not monitor suspicion levels, if game belongs to no valid leaderboard_id
	const leaderboard_id = leaderboardregistry.ofVariant(servergame.match.variant);
	if (leaderboard_id === undefined) return;

	for (const [playerStr, player] of Object.entries(servergame.match.playerData)) {
		if (!player.identifier.signedIn) {
			void logEvents.addAndPrint(
				`Unexpected: Player "${playerStr}" is not signed in. Game: ${gameutility.getSimplifiedGameString(servergame)}`,
				'errLog',
			);
			continue;
		}
		const user_id = player.identifier.user_id;
		const username = player.identifier.username;

		try {
			measurePlayer(user_id, username, leaderboard_id);
		} catch {
			// Already logged. Skip this player's check
		}
	}
}

/**
 * Weights a specific user's probability of rating abuse on a specified leaderboard.
 * If it flags a user, it sends Naviary an email with data on them.
 * @throws If a database error occurs.
 */
function measurePlayer(user_id: number, username: string, leaderboard_id: number): void {
	const due = consumeCheckInterval(user_id, leaderboard_id);
	if (due === undefined) return; // Not enough games played since the last check yet.

	// Retrieve the most recent ranked non-aborted games from the player_games table
	const recentPlayerGamesEntries = playerGamesManager.getRecentNRatedForUser(
		user_id,
		leaderboard_id,
		GAME_INTERVAL_TO_MEASURE,
		['game_id', 'score', 'player_number', 'elo_change_from_game'],
	);

	const netRatingChange = recentPlayerGamesEntries.reduce(
		(acc, g) => acc + (g.elo_change_from_game ?? 0),
		0,
	);
	const gameIds = recentPlayerGamesEntries.map((recent_game) => recent_game.game_id);

	// The player has lost elo the past GAME_INTERVAL_TO_MEASURE games. No cause for concern, early exit
	if (netRatingChange <= 0) {
		abusereport.reportNoRatingGain(user_id, username, leaderboard_id, netRatingChange, gameIds, GAME_INTERVAL_TO_MEASURE); // prettier-ignore
		return;
	}

	const evidence: AbuseEvidence = {
		games: buildGameInfoList(recentPlayerGamesEntries, gameIds),
		...gatherIdentityEvidence(user_id, gameIds),
	};

	const verdict = abusechecks.runAll(evidence);

	const ctx = { user_id, username, leaderboard_id, netRatingChange, gameIds, evidence };
	abusereport.reportMeasurement(ctx, verdict, due.lastAlertedAt);
}

/**
 * Counts this game against the player's check interval, resetting the counter when it trips.
 * @returns Their `last_alerted_at` when a check is now due, otherwise undefined.
 */
function consumeCheckInterval(
	user_id: number,
	leaderboard_id: number,
): { lastAlertedAt: string | null } | undefined {
	// If player is not in rating_abuse table, add him to it
	if (!ratingAbuseManager.isEntryIn(user_id, leaderboard_id))
		ratingAbuseManager.addEntry(user_id, leaderboard_id);

	// Access the player rating_abuse data
	const rating_abuse_data = ratingAbuseManager.getData(user_id, leaderboard_id, [
		'game_count_since_last_check',
		'last_alerted_at',
	]);
	// Increment game_count_since_last_check by 1
	const game_count_since_last_check = 1 + (rating_abuse_data.game_count_since_last_check || 0);

	// Early exit condition if the newly incremented game_count_since_last_check is still below the GAME_INTERVAL_TO_MEASURE threshhold
	if (game_count_since_last_check < GAME_INTERVAL_TO_MEASURE) {
		ratingAbuseManager.updateColumns(user_id, leaderboard_id, { game_count_since_last_check }); // update rating_abuse table with new value for game_count_since_last_check
		return undefined;
	}

	// Now we run the actual suspicion level check, thereby setting game_count_since_last_check to 0 from now on
	ratingAbuseManager.updateColumns(user_id, leaderboard_id, { game_count_since_last_check: 0 });

	return { lastAlertedAt: rating_abuse_data.last_alerted_at ?? null };
}

// Evidence Gathering ----------------------------------------------------------

/** Joins the player's recent games against the `games` table, deriving each one's final clock. */
function buildGameInfoList(
	recentPlayerGamesEntries: AbusePlayerGamesRecord[],
	gameIds: number[],
): AbuseGameInfo[] {
	// Retrieve these same games also from the games table.
	const recentGamesEntries = gamesManager.getMultipleData(gameIds, [
		'game_id',
		'date',
		'base_time_seconds',
		'increment_seconds',
		'termination',
		'move_count',
		'icn',
		'result',
	]);
	const games_table_game_id_list = recentGamesEntries.map((recent_game) => recent_game.game_id);

	// Combine the information about the games into a single gameInfoList object
	const gameInfoList: AbuseGameInfo[] = [];
	for (let i = 0; i < gameIds.length; i++) {
		const j = games_table_game_id_list.indexOf(gameIds[i]!);
		// If the same game_id exists in both lists of retrieved database entries, add this game as a single object to gameInfoList
		if (j > -1) {
			const playerEntry = recentPlayerGamesEntries[i]!;
			const gameRow = recentGamesEntries[j]!;
			const { icn: _icn, ...gameEntry } = gameRow;
			gameInfoList.push({
				...playerEntry,
				...gameEntry,
				finalClockMs: deriveFinalClockOfPlayer(
					gameRow,
					playerEntry.player_number as Player,
				),
			});
		} else {
			void logEvents.addAndPrint(
				`Found game_id ${gameIds[i]!} in player_games table but not it games table, during rating abuse calculation`,
				'errLog',
			);
		}
	}
	return gameInfoList;
}

/** Gathers who the player faced across those games, how often, their IP addresses, and their accounts. */
function gatherIdentityEvidence(user_id: number, gameIds: number[]): IdentityEvidence {
	// Get a list of the user_ids of the previous opponents of the player
	const opponentPlayerGamesEntries = playerGamesManager.getOpponentsOfUser(user_id, gameIds, ['user_id']); // prettier-ignore
	const opponentIds = opponentPlayerGamesEntries.map((entry) => entry.user_id!);
	const unique_user_id_list = [...new Set(opponentIds)];

	// Dictionary of frequencies of user_ids in opponentIds
	const opponentFrequency: Record<number, number> = {};
	for (const opponent_id of opponentIds) {
		opponentFrequency[opponent_id] = (opponentFrequency[opponent_id] || 0) + 1;
	}

	// Get the refresh tokens of the user and all his opponents
	let refreshTokenEntries: RefreshTokenRecord[];
	try {
		refreshTokenEntries = refreshTokenManager.findAllForUsers([
			user_id,
			...unique_user_id_list,
		]);
	} catch (error: unknown) {
		const message = jsutil.getErrorMessage(error);
		void logEvents.addAndPrint(
			`Error fetching refresh token entries for users "${JSON.stringify([user_id, ...unique_user_id_list])}": ${message}`,
			'errLog',
		);
		refreshTokenEntries = [];
	}

	// Extract the IP addresses of the user and his opponents from the refresh tokens
	const ipAddresses: string[] = []; // ip_addresses of the user
	const opponentIpAddresses: Record<number, string[]> = {}; // ip_addresses of his unique opponents
	for (const refreshToken of refreshTokenEntries) {
		if (refreshToken.ip_address === null) continue;

		// If the refresh token belongs to the user, add his IP address to ipAddresses
		if (refreshToken.user_id === user_id) ipAddresses.push(refreshToken.ip_address);
		// Else, add the IP address to the opponent's list
		else if (refreshToken.user_id in opponentFrequency) {
			opponentIpAddresses[refreshToken.user_id] =
				opponentIpAddresses[refreshToken.user_id] || []; // Initialize if undefined
			opponentIpAddresses[refreshToken.user_id]!.push(refreshToken.ip_address);
		}
	}

	// Get relevant MemberRecords of the opponents from the members table
	let opponents: AbuseEvidence['opponents'] = [];
	try {
		opponents = memberManager.getMultipleDataByCriteria(
			['username', 'user_id', 'joined'],
			'user_id',
			unique_user_id_list,
		);
	} catch (error: unknown) {
		const message = jsutil.getErrorMessage(error);
		void logEvents.addAndPrint(
			`Error fetching records for opponents during rating abuse calculation for user_id ${user_id}: ${message}`,
			'errLog',
		);
	}

	return { opponentIds, opponentFrequency, ipAddresses, opponentIpAddresses, opponents };
}

/**
 * Reads a player's remaining time at the end of a concluded game off its ICN's `clk` stamps.
 * A player who was still on the move when the game ended reads as their last stamp, matching
 * how PGN records final clocks. Undefined if the game was untimed.
 */
function deriveFinalClockOfPlayer(
	game: Pick<
		GamesRecord,
		'icn' | 'result' | 'termination' | 'base_time_seconds' | 'increment_seconds'
	>,
	player: Player,
): number | undefined {
	const longformat = icnconverter.ShortToLong_Format(game.icn);
	const players = gamerules.getUniquePlayersInTurnOrder(longformat.gameRules.turnOrder);
	const timeControl = clockutil.buildTimeControl(game.base_time_seconds, game.increment_seconds);
	const { clocks } = clock.init(players, timeControl);
	if (clocks === undefined) return undefined; // Untimed game — it has no clocks to read.

	const moves = longformat.moves ?? [];
	const gameConclusion = {
		condition: game.termination,
		victor: metadatautil.getVictorFromResult(game.result),
	} as GameConclusion; // The columns are plain TEXT; this mirrors deadgamestate's read.

	return clock.clocksAtMoveIndex(
		{ moves, gameRules: longformat.gameRules, gameConclusion, clocks },
		moves.length - 1,
	)[player];
}

// Exports ---------------------------------------------------------------------

export default {
	measureAfterGame,
};
