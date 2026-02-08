// src/server/game/gamemanager/gamelogger.ts

/**
 * This script logs all completed games into the "games" database table
 * It also computes the players' ratings in rated games and logs them into the "ratings" table
 * It also updates the players' stats in the "players_stats" table
 */

import type { Game } from '../../../shared/chess/logic/gamefile.js';
import type { ServerGame } from './gameutility.js';
import type { RatingData } from './ratingcalculation.js';

import timeutil from '../../../shared/util/timeutil.js';
import clockutil from '../../../shared/chess/util/clockutil.js';
import icnconverter from '../../../shared/chess/logic/icn/icnconverter.js';
import { VariantLeaderboards } from '../../../shared/chess/variants/validleaderboard.js';
import { PlayerGroup, Player } from '../../../shared/chess/util/typeutil.js';

import db from '../../database/database.js';
import gameutility from './gameutility.js';
import { logEvents, logEventsAndPrint } from '../../middleware/logEvents.js';
import {
	computeRatingDataChanges,
	DEFAULT_LEADERBOARD_ELO,
	DEFAULT_LEADERBOARD_RD,
} from './ratingcalculation.js';
import {
	addUserToLeaderboard,
	getPlayerLeaderboardRating_core,
	isPlayerInLeaderboard,
	updatePlayerLeaderboardRating,
} from '../../database/leaderboardsManager.js';

// Functions -------------------------------------------------------------------------------

/**
 * Logs a completed game to the database by executing an atomic transaction.
 * Adds to and updates tables: games, player_games, player_stats, and leaderboards.
 * Either all database queries succeed, or none do (rollback on error).
 * This ensures data integrity and consistency.
 * @param servergame - The game to log
 * @returns The rating data if the game was rated and not aborted, otherwise undefined.
 */
async function logGame(servergame: ServerGame): Promise<RatingData | undefined> {
	if (servergame.basegame.moves.length === 0) return undefined; // Don't log games with zero moves

	try {
		// Create the transaction by wrapping our orchestrator function.
		// We no longer need to pass any parameters here.
		const transaction = db.transaction<[ServerGame], RatingData | undefined>((g) => {
			return logGame_orchestrator(g);
		});

		// Execute the transaction. Typically takes 2-8 milliseconds when using NVME storage.
		const ratingData = transaction(servergame);

		// If we reach here, the transaction was successful.
		return ratingData;
	} catch (error) {
		// This block will only execute if the orchestrator throws an error, causing a rollback.
		const errorMessage = error instanceof Error ? error.message : String(error);
		const errorStack = error instanceof Error ? error.stack : 'No stack trace available';
		await logEventsAndPrint(
			`FATAL: Game log transaction failed and was rolled back for Game ID ${servergame.match.id}. Check unloggedGames log. Error: ${errorMessage}\n${errorStack}`,
			'errLog.txt',
		);
		await logEvents(
			`Game: ${gameutility.getSimplifiedGameString(servergame)}`,
			'unloggedGames.txt',
		);
		return undefined;
	}
}

/**
 * This is the core orchestrator that runs INSIDE the transaction of logging the game.
 * It performs all reads, calculations, and writes in a single, atomic operation.
 * It is designed to throw an error on any failure to trigger a rollback of the database.
 * Either ALL operations succeed, or NONE do.
 */
function logGame_orchestrator(servergame: ServerGame): RatingData | undefined {
	const { victor, condition: termination } = servergame.basegame.gameConclusion!;

	// --- Part 1: Handle Rating Updates ---
	const ratingData = updateLeaderboardsInTransaction(servergame, victor);

	// --- Part 2: Create Game Records in games and player_games tables ---
	addGameRecordsInTransaction(servergame, victor, termination, ratingData);

	// --- Part 3: Update Player Stats ---
	updateAllPlayerStatsInTransaction(servergame, victor);

	// If all steps succeed, return the rating data.
	return ratingData;
}

/**
 * Updates leaderboards within the transaction. It calculates rating changes
 * and calls the unsafe (error-throwing) _core functions to update the database.
 * @returns The final rating data object, or undefined if the game was not rated, or aborted.
 * @throws An error if any database write fails.
 */
function updateLeaderboardsInTransaction(
	{ match, basegame }: ServerGame,
	victor: Player | null | undefined,
): RatingData | undefined {
	if (!match.rated || victor === undefined) return undefined; // If game is unrated or aborted, then no ratings get updated

	const leaderboard_id = VariantLeaderboards[basegame.metadata.Variant!];
	if (leaderboard_id === undefined) return undefined; // This should never happen. If it does it means the game should not have been rated.

	// 1. Build initial rating data by reading from the DB.
	let ratingdata: RatingData = {};
	for (const playerStr in match.playerData) {
		const player: Player = Number(playerStr) as Player;
		const user_id = match.playerData[player]?.identifier.signedIn
			? match.playerData[player].identifier.user_id
			: undefined;
		if (user_id === undefined)
			throw new Error(
				`Attempted to process rating for player ${playerStr} in rated game ${match.id} without a user_id.`,
			);

		// If a player isn't on the leaderboard, add them first.
		// We use the _core (error-throwing) version because we are inside a transaction.
		if (!isPlayerInLeaderboard(user_id, leaderboard_id)) {
			addUserToLeaderboard(
				user_id,
				leaderboard_id,
				DEFAULT_LEADERBOARD_ELO,
				DEFAULT_LEADERBOARD_RD,
			);
		}

		// We can now safely assume the player has a rating record.
		const leaderboard_data = getPlayerLeaderboardRating_core(user_id, leaderboard_id);
		if (leaderboard_data === undefined)
			throw Error(
				`Unable to read leaderboard data for user_id ${user_id} in leaderboard ${leaderboard_id}. This should never happen, they should have been added!`,
			);

		ratingdata[player] = {
			elo_at_game: leaderboard_data.elo,
			rating_deviation_at_game: leaderboard_data.rating_deviation,
			rd_last_update_date: leaderboard_data.rd_last_update_date,
		};
	}

	// 2. Calculate the new ratings.
	ratingdata = computeRatingDataChanges(ratingdata, victor);

	// 3. Write the new ratings to the database.
	for (const playerStr in ratingdata) {
		const player: Player = Number(playerStr) as Player;
		// TS is annoying sometimes, we already know all the players have user_ids
		const user_id = match.playerData[player]!.identifier.signedIn
			? match.playerData[player]!.identifier.user_id
			: undefined;
		const data = ratingdata[player]!;
		updatePlayerLeaderboardRating(
			user_id!,
			leaderboard_id,
			data.elo_after_game!,
			data.rating_deviation_after_game!,
		);
	}

	return ratingdata;
}

/**
 * [INTERNAL] Adds records to `games` and `player_games` tables. This function contains the "merged logic". Throws on error.
 * @returns The new game_id.
 */
function addGameRecordsInTransaction(
	{ match, basegame }: ServerGame,
	victor: Player | null | undefined,
	termination: string,
	ratingData: RatingData | undefined,
): void {
	const { base_time_seconds, increment_seconds } = clockutil.splitTimeControl(
		basegame.metadata.TimeControl,
	);

	// --- Prepare ICN ---
	const icn = getICNOfGame(basegame); // This will throw on failure.

	const dateSqliteString = timeutil.timestampToSqlite(match.timeCreated);

	// 1. Insert the main record into the 'games' table.
	const gameQuery = `
		INSERT INTO games (
			game_id, date, base_time_seconds, increment_seconds, variant, rated,
			leaderboard_id, private, result, termination, move_count,
			time_duration_millis, icn
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

	const gameResult = db.run(gameQuery, [
		match.id,
		dateSqliteString,
		base_time_seconds,
		increment_seconds,
		basegame.metadata.Variant!,
		match.rated ? 1 : 0,
		VariantLeaderboards[basegame.metadata.Variant!] ?? null,
		match.publicity === 'private' ? 1 : 0,
		basegame.metadata.Result!,
		termination,
		basegame.moves.length,
		match.timeEnded ? match.timeEnded - match.timeCreated : null,
		icn, // Use the pre-generated ICN
	]);
	const game_id = gameResult.lastInsertRowid as number;

	// 2. Loop through players and insert records into the 'player_games' table.
	const playerGamesQuery = `
		INSERT INTO player_games (
			user_id, game_id, player_number, score,
			clock_at_end_millis, elo_at_game, elo_change_from_game
		) VALUES (?, ?, ?, ?, ?, ?, ?)`;

	const ending_clocks = !basegame.untimed
		? gameutility.getGameClockValues(basegame).clocks
		: undefined;
	for (const playerStr in match.playerData) {
		const player = Number(playerStr) as Player;
		const user_id = match.playerData[player]!.identifier.signedIn
			? match.playerData[player]!.identifier.user_id
			: undefined;
		if (!user_id) continue;

		// prettier-ignore
		db.run(playerGamesQuery, [
			user_id,
			game_id,
			player,
			victor === undefined ? null : victor === player ? 1 : victor === null ? 0.5 : 0,
			!basegame.untimed ? ending_clocks![player]! : null,
			ratingData?.[player]?.elo_at_game ?? null,
			ratingData?.[player]?.elo_change_from_game ?? null,
		]);
	}
}

/**
 * [INTERNAL] Loops through all players in a game and updates their stats by calling
 * the single-player update function.
 */
function updateAllPlayerStatsInTransaction(
	{ basegame, match }: ServerGame,
	victor: Player | null | undefined,
): void {
	const playerMoveCounts = getPlayerMoveCountsInGame({ basegame, match });

	for (const playerStr in match.playerData) {
		const player = Number(playerStr) as Player;
		const user_id = match.playerData[player]!.identifier.signedIn
			? match.playerData[player]!.identifier.user_id
			: undefined;
		if (!user_id) continue; // Guests dono't have any stats to update.

		// prettier-ignore
		updateSinglePlayerStatsInTransaction(user_id, {
			moves_played_increment: playerMoveCounts[player]!,
			outcome: victor === undefined ? 'aborted' : victor === player ? "wins" : victor === null ? "draws" : "losses",
			is_rated: match.rated,
			publicity: match.publicity,
		});
	}
}

/**
 * [INTERNAL] Updates a player's aggregate stats in the `player_stats` table.
 * This logic is co-located here because it is only ever used by the logGame transaction.
 * This version uses direct SQL increments for efficiency (`col = col + 1`).
 * It does not throw an error if the user is not found, as a user might be
 * deleted mid-game. It logs this event instead.
 */
function updateSinglePlayerStatsInTransaction(
	user_id: number,
	statsToUpdate: {
		moves_played_increment: number;
		outcome: 'wins' | 'losses' | 'draws' | 'aborted';
		is_rated: boolean;
		publicity: 'public' | 'private';
	},
): void {
	// Start building the list of columns to update and the values for them.
	const setClauses: string[] = ['moves_played = moves_played + ?', 'game_count = game_count + 1'];
	const values: (number | string)[] = [statsToUpdate.moves_played_increment];

	if (statsToUpdate.outcome === 'aborted') {
		setClauses.push('game_count_aborted = game_count_aborted + 1');
	} else {
		const ratedString: 'rated' | 'casual' = statsToUpdate.is_rated ? 'rated' : 'casual';

		// Increment the correct rated/casual counter.
		setClauses.push(`game_count_${ratedString} = game_count_${ratedString} + 1`);

		// Increment the correct public/private counter.
		// This is safe because `statsToUpdate.publicity` can only be 'public' or 'private'.
		setClauses.push(
			`game_count_${statsToUpdate.publicity} = game_count_${statsToUpdate.publicity} + 1`,
		);

		// Increment the correct win/loss/draw counter.
		setClauses.push(
			`game_count_${statsToUpdate.outcome} = game_count_${statsToUpdate.outcome} + 1`,
		);

		// Increment the correct combined outcome + rated/casual counter.
		setClauses.push(
			`game_count_${statsToUpdate.outcome}_${ratedString} = game_count_${statsToUpdate.outcome}_${ratedString} + 1`,
		);
	}

	const query = `UPDATE player_stats SET ${setClauses.join(', ')} WHERE user_id = ?`;
	values.push(user_id);

	const result = db.run(query, values);

	if (result.changes === 0) {
		// This should now be impossible. If it happens, it's a critical error.
		throw new Error(
			`CRITICAL: User ${user_id} not found in player_stats during game log. This should not be possible. Did we allow them to delete their account mid-game?`,
		);
	}
}

/** Converts a server-side {@link Game} into an ICN */
function getICNOfGame(game: Game): string {
	// Get ICN of game
	let ICN: string;
	try {
		ICN = icnconverter.LongToShort_Format(
			{
				...game,
				fullMove: 1,
				state_global: {
					moveRuleState: game.gameRules.moveRule !== undefined ? 0 : undefined,
				},
			},
			{
				skipPosition: true,
				compact: true,
				spaces: false,
				comments: true,
				make_new_lines: false,
				move_numbers: false,
			},
		);
	} catch (error: unknown) {
		const errMessage = error instanceof Error ? error.message : String(error);
		const errStack = error instanceof Error ? error.stack : 'No stack trace available';
		// Re-throw error with additional context, the orchestrator will catch it and roll back the transaction.
		throw Error(
			`Error converting game to ICN: ${errMessage}\nThe primed gamefile:\n${JSON.stringify(game)}\n${errStack}`,
		);
	}

	return ICN;
}

/**
 * Counts the number of moves each player has made in the game.
 *
 * TODO: Move to moveutil script, once its dependancies are healthy!!!
 */
function getPlayerMoveCountsInGame({ match, basegame }: ServerGame): PlayerGroup<number> {
	// Optimized to not require iterating through each move in the list.
	const playerMoveCounts: PlayerGroup<number> = {};
	const fullmoves_completed_total = Math.floor(
		basegame.moves.length / basegame.gameRules.turnOrder.length,
	);
	const last_partial_move_length = basegame.moves.length % basegame.gameRules.turnOrder.length;
	for (const playerStr in match.playerData) {
		const player: Player = Number(playerStr) as Player;
		playerMoveCounts[player] =
			fullmoves_completed_total *
			basegame.gameRules.turnOrder.filter((p: Player) => p === player).length;
		playerMoveCounts[player] += basegame.gameRules.turnOrder
			.slice(0, last_partial_move_length)
			.filter((p: Player) => p === player).length;
	}
	return playerMoveCounts;
}

export default {
	logGame,
};
