// src/server/game/ratingabuse/ratingAbuse.ts

/**
 * Weights a user's probability of rating abuse — repeatedly losing on purpose from an
 * alt account, or aborting games to dodge an elo loss — every few rated games they play.
 *
 * The entry point and the gatherer: it decides who is due for a check and assembles their
 * evidence. `abuseChecks.ts` weighs that evidence, and `abuseReport.ts` reports the verdict.
 */

import type { Player } from '../../../shared/chess/util/typeutil.js';
import type { ServerGame } from '../gamemanager/serverGameTypes.js';
import type { GamesRecord } from '../../database/gamesManager.js';
import type { LongFormatOut } from '../../../shared/chess/logic/icn/icnconverter.js';
import type {
	AbuseEvidence,
	AbuseGameInfo,
	AbusePlayerGamesRecord,
	IdentityEvidence,
} from './ratingAbuseTypes.js';

import clock from '../../../shared/chess/logic/clock.js';
import gamerules from '../../../shared/chess/util/gamerules.js';
import clockutil from '../../../shared/chess/util/clockutil.js';
import icnconverter from '../../../shared/chess/logic/icn/icnconverter.js';
import leaderboardregistry from '../../../shared/chess/variants/leaderboardregistry.js';

import abuseChecks from './abuseChecks.js';
import abuseReport from './abuseReport.js';
import gamesManager from '../../database/gamesManager.js';
import deadGameState from '../gamemanager/deadGameState.js';
import memberManager from '../../database/memberManager.js';
import playerGamesManager from '../../database/playerGamesManager.js';
import playerStatsManager from '../../database/playerStatsManager.js';
import refreshTokenManager from '../../database/refreshTokenManager.js';

// Constants -------------------------------------------------------------------

/** How many games played to measure a player's rating abuse probability at once. */
const GAME_INTERVAL_TO_MEASURE = 5;

// Measurement -----------------------------------------------------------------

/**
 * Monitor suspicion levels for all players of a rated game. Aborted games are skipped: they
 * don't add to the rated game count, so they'd repeat the last check.
 */
function measureAfterGame(servergame: ServerGame): void {
	if (!servergame.match.rated || servergame.gameConclusion!.victor === undefined) return;

	const leaderboard_id = leaderboardregistry.ofVariant(servergame.match.variant)!; // Will always be defined if the game is rated.

	for (const { identifier } of Object.values(servergame.match.playerData)) {
		if (!identifier.signedIn) continue; // Narrows the type only: rated games seat members alone.

		try {
			measurePlayer(identifier.user_id, identifier.username, leaderboard_id);
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
	// Only every GAME_INTERVAL_TO_MEASURE-th rated game is checked. The count spans every
	// leaderboard, which is exact while INFINITY is the only one.
	const stats = playerStatsManager.getData(user_id, ['game_count_rated'])!; // Rated games finalize before an account can go.
	if (stats.game_count_rated % GAME_INTERVAL_TO_MEASURE !== 0) return;

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
	if (netRatingChange <= 0) return;

	const evidence: AbuseEvidence = {
		games: buildGameInfoList(recentPlayerGamesEntries, gameIds),
		...gatherIdentityEvidence(user_id, gameIds),
	};

	const verdict = abuseChecks.runAll(evidence);
	if (!verdict.suspicious) return;

	const ctx = { user_id, username, netRatingChange, evidence };
	abuseReport.reportFlagged(ctx, verdict);
}

// Evidence Gathering ----------------------------------------------------------

/** Joins the player's recent games against the `games` table, deriving how much of their clock each left unused. */
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

	return recentPlayerGamesEntries.map((playerEntry) => {
		const { icn, ...gameEntry } = recentGamesEntries.find((g) => g.game_id === playerEntry.game_id)!; // prettier-ignore
		const longformat = icnconverter.ShortToLong_Format(icn);
		// Rated games are always timed, so the player has a final clock.
		const finalClockMs = deriveFinalClockOfPlayer(gameEntry, longformat, playerEntry.player_number as Player)!; // prettier-ignore
		return {
			...playerEntry,
			...gameEntry,
			unusedClockFraction: deriveUnusedClockFraction(gameEntry, finalClockMs),
			moveRule: longformat.gameRules.moveRule,
		};
	});
}

/** Gathers who the player faced across those games, how often, their IP addresses, and their accounts. */
function gatherIdentityEvidence(user_id: number, gameIds: number[]): IdentityEvidence {
	// Get a list of the user_ids of the previous opponents of the player
	const opponentPlayerGamesEntries = playerGamesManager.getOpponentsOfUser(user_id, gameIds, ['game_id', 'user_id']); // prettier-ignore
	const opponentIdByGame = Object.fromEntries(opponentPlayerGamesEntries.map((entry) => [entry.game_id, entry.user_id!])); // prettier-ignore
	const unique_user_id_list = [...new Set(Object.values(opponentIdByGame))];

	// How many of the games each opponent accounts for
	const opponentFrequency: Record<number, number> = {};
	for (const opponent_id of Object.values(opponentIdByGame)) {
		opponentFrequency[opponent_id] = (opponentFrequency[opponent_id] || 0) + 1;
	}

	// Get the refresh tokens of the user and all his opponents
	const refreshTokenEntries = refreshTokenManager.findAllForUsers([
		user_id,
		...unique_user_id_list,
	]);

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
	// Compare them, wherever both sides have IP addresses to compare
	const opponentSharesIp: Record<number, boolean> = {};
	if (ipAddresses.length > 0) {
		for (const [opponent_id, opponentIps] of Object.entries(opponentIpAddresses)) {
			opponentSharesIp[Number(opponent_id)] = opponentIps.some((ip) =>
				ipAddresses.includes(ip),
			);
		}
	}

	// Get relevant MemberRecords of the opponents from the members table
	const opponents = memberManager.getMultipleDataByCriteria(
		['username', 'user_id', 'joined'],
		'user_id',
		unique_user_id_list,
	);

	return { opponentIdByGame, opponentFrequency, ipAddresses, opponentSharesIp, opponents };
}

/**
 * Reads a player's remaining time at the end of a concluded game off its ICN's `clk` stamps.
 * A player who was still on the move when the game ended reads as their last stamp, matching
 * how PGN records final clocks. Undefined if the game was untimed.
 * @param longformat - The game's parsed ICN.
 */
function deriveFinalClockOfPlayer(
	game: Pick<GamesRecord, 'result' | 'termination' | 'base_time_seconds' | 'increment_seconds'>,
	longformat: LongFormatOut,
	player: Player,
): number | undefined {
	const players = gamerules.getUniquePlayersInTurnOrder(longformat.gameRules.turnOrder);
	const timeControl = clockutil.buildTimeControl(game.base_time_seconds, game.increment_seconds);
	const { clocks } = clock.init(players, timeControl);
	if (clocks === undefined) return undefined; // Untimed game — it has no clocks to read.

	const moves = longformat.moves ?? [];
	const gameConclusion = deadGameState.decodeConclusion(game);

	return clock.clocksAtMoveIndex(
		{ moves, gameRules: longformat.gameRules, gameConclusion, clocks },
		moves.length - 1,
	)[player];
}

/** The fraction of their own clock a player left unused in a game, in [0, 1]. */
function deriveUnusedClockFraction(
	game: Pick<GamesRecord, 'base_time_seconds' | 'increment_seconds' | 'move_count'>,
	finalClockMs: number,
): number {
	/** The player's own clock budget: their base time, plus the increment earned on their share of the moves. */
	const available_clock_ms =
		1000 * (game.base_time_seconds! + 0.5 * game.increment_seconds! * (game.move_count - 1));
	// Capped, since the halved increment is an average — whoever moved more than their share earns above it.
	return Math.min(1, finalClockMs / available_clock_ms);
}

// Exports ---------------------------------------------------------------------

export default {
	measureAfterGame,
};
