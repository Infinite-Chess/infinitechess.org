
// src/server/game/gamemanager/gamelogger.ts

/**
 * This script logs all completed games into the "games" database table
 * It also computes the players' ratings in rated games and logs them into the "ratings" table
 * It also updates the players' stats in the "players_stats" table
 */

import { addGameToGamesTable } from '../../database/gamesManager.js';
import { getPlayerStatsData, updatePlayerStatsColumns } from "../../database/playerStatsManager.js";
import jsutil from '../../../client/scripts/esm/util/jsutil.js';
import { PlayerGroup, players, type Player } from '../../../client/scripts/esm/chess/util/typeutil.js';
import { addUserToLeaderboard, updatePlayerLeaderboardRating, getPlayerLeaderboardRating, isPlayerInLeaderboard, Rating } from "../../database/leaderboardsManager.js";
import { VariantLeaderboards } from '../../../client/scripts/esm/chess/variants/validleaderboard.js';
import { computeRatingDataChanges, UNCERTAIN_LEADERBOARD_RD } from './ratingcalculation.js';
import { addGameToPlayerGamesTable } from '../../database/playerGamesManager.js';
import icnconverter, { LongFormatIn } from '../../../client/scripts/esm/chess/logic/icn/icnconverter.js';
import { logEvents, logEventsAndPrint } from '../../middleware/logEvents.js';
// @ts-ignore
import winconutil from '../../../client/scripts/esm/chess/util/winconutil.js';
// @ts-ignore
import gameutility from './gameutility.js';
// @ts-ignore
import timeutil from '../../../client/scripts/esm/util/timeutil.js';
// @ts-ignore
import clockutil from '../../../client/scripts/esm/chess/util/clockutil.js';

import db from '../../database/database.js'; 


import type { RunResult, SqliteError } from 'better-sqlite3'; // You may need to add this import
import type { MetaData } from '../../../client/scripts/esm/chess/util/metadata.js';
import type { RatingData } from './ratingcalculation.js';
// @ts-ignore
import type { Game } from '../TypeDefinitions.js';


// Functions -------------------------------------------------------------------------------


/**
 * Logs a completed game to the database
 * Updates the tables "games", "player_stats" and "ratings" (computing the rating changes if necessary).
 * Only call after the game ends, and when it's being deleted.
 * 
 * Async so that the server can wait for logs to finish when
 * the server is restarting/closing.
 * @param {Game} game - The game to log
 */
async function logGame(game: Game) : Promise<RatingData | undefined> {
	if (game.moves.length === 0) return undefined; // Don't log games with zero moves

	// Convert the Date of the game to Sqlite string
	const dateSqliteString = timeutil.timestampToSqlite(game.timeCreated);

	// 1. Update the leaderboards table
	const victor: Player | undefined = winconutil.getVictorAndConditionFromGameConclusion(game.gameConclusion).victor;
	const ratingdata = await updateLeaderboardsTable(game, victor);

	// 2. Enter the game into the games table
	const results = await enterGameInGamesTable(game, dateSqliteString, ratingdata);
	if (results.success === false) { // Failure to log game into database and update player stats
		await logEventsAndPrint('Failed to log game. Check unloggedGames log. Not incrementing player stats either.', 'errLog.txt');
		await logEvents(results.reason, 'unloggedGames.txt'); // Log into a separate log
		return undefined;
	}

	// 3. Enter the game into the player_games table
	await updatePlayerGamesTable(game, results.game_id, victor, ratingdata);

	// 4. Update the player_stats table
	await updatePlayerStatsTable(game, results.game_id, victor);

	return ratingdata;
}

/** The return result of {@link enterGameInGamesTable} */
type LogGameResult = { success: true; game_id: number } | { success: false; reason: string };

/** Enters a game into the games table */
async function enterGameInGamesTable(game: Game, dateSqliteString: string, ratingdata?: RatingData): Promise<LogGameResult> {

	let ratings: PlayerGroup<Rating>;
	if (ratingdata) {
		// Construct the ratings for each player based on the ratingdata.
		// CAN'T USE gameutility.getRatingDataForGamePlayers() HERE because
		// the players elos have CHANGED in the database since the start of the game.
		ratings = {};
		for (const [playerStr, data] of Object.entries(ratingdata)) {
			ratings[Number(playerStr) as Player] = {
				value: data.elo_at_game,
				confident: data.rating_deviation_at_game <= UNCERTAIN_LEADERBOARD_RD
			};
		}
	} else {
		// No ratingdata, which means the players elos in the database
		// correctly represents their elo at the start of the game.
		ratings = gameutility.getRatingDataForGamePlayers(game);
	}

	const metadata = gameutility.getMetadataOfGame(game, ratings, ratingdata);

	const ICN = await getICNOfGame(game, metadata);
	if (!ICN) return { success: false, reason: `ICN undefined when logging game, cannot log or increment player stats! Game: ${gameutility.getSimplifiedGameString(game)}` };

	const terminationCode = winconutil.getVictorAndConditionFromGameConclusion(game.gameConclusion).condition;
	const game_rated: 0 | 1 = (game.rated ? 1 : 0);
	const leaderboard_id = VariantLeaderboards[game.variant] ?? null; // Include the leaderboard_id even if the game wasn't rated, so we can still filter
	const game_private: 0 | 1 = (game.publicity !== 'public' ? 1 : 0);
	const { base_time_seconds, increment_seconds } = clockutil.splitTimeControl(game.clock);
	const game_time_duration_millis = (game.timeEnded !== undefined ? game.timeEnded - game.timeCreated : null);

	const gameToLog = {
		game_id: game.id,
		date: dateSqliteString,
		base_time_seconds,
		increment_seconds,
		variant: game.variant as string,
		rated: game_rated,
		leaderboard_id,
		private: game_private,
		result: metadata.Result as string,
		termination: terminationCode,
		move_count: game.moves.length,
		time_duration_millis: game_time_duration_millis,
		icn: ICN
	};

	// Add game to games table in database
	const results = addGameToGamesTable(gameToLog);
	if (!results.success) {
		const extendedReason = `Error when adding game to database: ${results.reason}. The game: ${gameutility.getSimplifiedGameString(game)}. The ICN:\n${ICN}`;
		return { success: false, reason: extendedReason };
	}
	return { success: true, game_id: results.result.lastInsertRowid as number }; // The lastInsertRowid is the id of the game we just inserted
}

/**
 * [INTERNAL] Adds a record to the `games` table within a transaction. Throws on error.
 * This logic is co-located here instead of gamesManager.ts
 * because it is only ever used by the logGame transaction.
 * @throws {SqliteError}
 */
function addGameRecordInTransaction(
	options: {
        game_id: number,
        date: string,
        base_time_seconds: number | null,
        increment_seconds: number | null,
        variant: string,
        rated: 0 | 1,
        leaderboard_id: number | null,
        private: 0 | 1,
        result: string,
        termination: string,
        move_count: number,
        time_duration_millis: number | null,
        icn: string
    }): RunResult {

	const query = `
    INSERT INTO games (
        game_id, date, base_time_seconds, increment_seconds, variant, rated,
        leaderboard_id, private, result, termination, move_count,
        time_duration_millis, icn
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

	// This db.run() will throw an error on failure, which is what the transaction needs.
	return db.run(query, 
        [
            options.game_id, options.date, options.base_time_seconds,
            options.increment_seconds, options.variant, options.rated,
            options.leaderboard_id, options.private, options.result,
            options.termination, options.move_count, options.time_duration_millis,
            options.icn
        ]
	);
}

/**
 * [INTERNAL] Adds a player's entry to the `player_games` table within a transaction. Throws on error.
 * This logic is co-located here because it is only ever used by the logGame transaction.
 * @throws {SqliteError}
 */
function addPlayerGameRecordInTransaction(
	options: {
        user_id: number,
        game_id: number,
        player_number: Player,
        score: number | null,
        clock_at_end_millis: number | null,
        elo_at_game: number | null,
        elo_change_from_game: number | null,
    }): RunResult {

	const query = `
    INSERT INTO player_games (
        user_id, game_id, player_number, score,
        clock_at_end_millis, elo_at_game, elo_change_from_game
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    
	// This will throw an error on failure, which is what the transaction needs.
	return db.run(query,
        [
            options.user_id,
            options.game_id,
            options.player_number,
            options.score,
            options.clock_at_end_millis,
            options.elo_at_game,
            options.elo_change_from_game
        ]
	);
}

/**
 * [INTERNAL] Updates a player's aggregate stats in the `player_stats` table.
 * This logic is co-located here because it is only ever used by the logGame transaction.
 * This version uses direct SQL increments for efficiency (`col = col + 1`).
 * It does not throw an error if the user is not found, as a user might be
 * deleted mid-game. It logs this event instead.
 */
function updatePlayerStatsInTransaction(
	user_id: number,
	statsToUpdate: {
        moves_played_increment: number;
        outcome: 'wins' | 'losses' | 'draws' | 'aborted';
        is_rated: boolean;
        publicity: 'public' | 'private';
    }): void {

	// Build the dynamic part of the SET clause
	const setClauses = ['moves_played = moves_played + ?', 'game_count = game_count + 1'];
	const values: (number | string)[] = [statsToUpdate.moves_played_increment];

	if (statsToUpdate.outcome === 'aborted') {
		setClauses.push('game_count_aborted = game_count_aborted + 1');
	} else {
		const ratedString = statsToUpdate.is_rated ? "rated" : "casual";
		setClauses.push(`game_count_${ratedString} = game_count_${ratedString} + 1`);
		setClauses.push(`game_count_${statsToUpdate.publicity} = game_count_${statsToUpdate.publicity} + 1`);
		setClauses.push(`game_count_${statsToUpdate.outcome} = game_count_${statsToUpdate.outcome} + 1`);
		setClauses.push(`game_count_${statsToUpdate.outcome}_${ratedString} = game_count_${statsToUpdate.outcome}_${ratedString} + 1`);
	}

	const query = `UPDATE player_stats SET ${setClauses.join(', ')} WHERE user_id = ?`;
	values.push(user_id);

	const result = db.run(query, values);

	if (result.changes === 0) {
		// This is not a fatal error for the transaction, but it's worth logging.
		// A user might have been deleted mid-game. The other players' stats should still update.
		logEvents(`User ${user_id} not found in player_stats during game log.`, 'errLog.txt');
	}
}

/** Converts a server-side {@link Game} into an ICN */
async function getICNOfGame(game: Game, metadata: MetaData): Promise<string | undefined> {
	// We need to prime the gamefile for the format converter to get the ICN of the game.
	const gameRules = jsutil.deepCopyObject(game.gameRules);
	const longformIn: LongFormatIn = {
		metadata,
		state_global: {
			moveRuleState: gameRules.moveRule !== undefined ? 0 : undefined,
		},
		fullMove: 1,
		moves: game.moves,
		gameRules
	};

	// Get ICN of game
	let ICN: string | undefined;
	try {
		ICN = icnconverter.LongToShort_Format(longformIn, { skipPosition: true, compact: true, spaces: false, comments: true, make_new_lines: false, move_numbers: false });
	} catch (error: unknown) {
		const stack = error instanceof Error ? error.stack : String(error);
		const errText = `Error when logging game and converting to ICN! The game: ${gameutility.getSimplifiedGameString(game)}. The primed gamefile:\n${JSON.stringify(longformIn)}\n${stack}`;
		await logEventsAndPrint(errText, 'errLog.txt');
	}

	return ICN;
}

/**
 * If the game was ranked, also update the leaderboards table accordingly.
 * Returns rating data IF ratings were changed, otherwise returns undefined.
 */
async function updateLeaderboardsTable(game: Game, victor: Player | undefined) : Promise<RatingData | undefined> {
	if (!game.rated || victor === undefined) return undefined; // If game is unrated or aborted, then no ratings get updated

	const leaderboard_id = VariantLeaderboards[game.variant];
	if (leaderboard_id === undefined) return undefined; // If game belongs to no valid leaderboard_id, then no ratings get updated

	// Loop over all players of game in order to construct ratingdata object
	let ratingdata : RatingData = {};
	for (const playerStr in game.players) {
		const player: Player = Number(playerStr) as Player;
		const user_id = game.players[playerStr].identifier.user_id;
		if (user_id === undefined) {
			await logEventsAndPrint(`Unexpected: trying to log ranked game for a player without a user_id. Game: ${JSON.stringify(game)}`, 'errLog.txt');
			return undefined;
		}

		// If player is not on leaderboard, add him to it
		if (!isPlayerInLeaderboard(user_id, leaderboard_id)) addUserToLeaderboard(user_id, leaderboard_id);

		// Access the player leaderboard data
		const leaderboard_data = getPlayerLeaderboardRating(user_id, leaderboard_id);
		if (leaderboard_data === undefined) {
			await logEventsAndPrint(`Unable to read leaderboard_data of user ${user_id} while updating leaderboard ${leaderboard_id}!`, 'errLog.txt');
			return undefined;
		}

		ratingdata[player] = {
			elo_at_game: leaderboard_data.elo,
			rating_deviation_at_game: leaderboard_data.rating_deviation,
			rd_last_update_date: leaderboard_data.rd_last_update_date,
		};
	}

	// Perform calculation of new ratings by adding relevant entries in ratingdata object
	ratingdata = computeRatingDataChanges(ratingdata, victor);

	// Update the rating data of each player in leaderboard table
	for (const playerStr in game.players) {
		const player: Player = Number(playerStr) as Player;
		const user_id = game.players[playerStr].identifier.user_id;

		const elo = ratingdata[player]!.elo_after_game!;
		const rd = ratingdata[player]!.rating_deviation_after_game!;

		// Push changed player_stats to database
		const results = updatePlayerLeaderboardRating(user_id, leaderboard_id, elo, rd);

		if (!results.success) {
			await logEventsAndPrint(`Failed to update leaderboard data for player ${user_id} and leaderboard ${leaderboard_id}.`, 'errLog.txt');
			continue;
		}
	}

	return ratingdata;
}

/**
 * For each member, add an entry into player_games according to the results of this game.
 */
async function updatePlayerGamesTable(game: Game, game_id: number, victor: Player | undefined, ratingdata?: RatingData) {
	const ending_clocks = gameutility.getGameClockValues(game).clocks;

	for (const playerStr in game.players) {
		const player: Player = Number(playerStr) as Player;
		const user_id = game.players[playerStr].identifier.user_id;
		if (user_id === undefined) continue; // Guest players don't get an entry in the player_games table or an elo for updating

		const score = victor === undefined ? null : victor === player ? 1 : victor === players.NEUTRAL ? 0.5 : 0;
		const clock_at_end_millis = ending_clocks[playerStr] ?? null;
		const elo_at_game = (ratingdata ?? {})[player]?.elo_at_game ?? null;
		const elo_change_from_game = (ratingdata ?? {})[player]?.elo_change_from_game! ?? null;

		const options = {
			user_id: user_id,
			game_id: game_id,
			player_number: player,
			score,
			clock_at_end_millis,
			elo_at_game,
			elo_change_from_game
		};

		// Add game to player_games table in database
		const results = addGameToPlayerGamesTable(options);
		if (!results.success) {
			await logEventsAndPrint('Failed to add game to player_games table after game. Check unloggedGames log.', 'errLog.txt');
			const errText = `Error when adding game to player_games when logging game: ${results.reason}  Member "${game.players[playerStr].identifier.member}", user_id "${user_id}". Their color: ${playerStr}. Game ID: ${game_id}. The game: ${gameutility.getSimplifiedGameString(game)}`;
			await logEvents(errText, 'unloggedGames.txt');
			continue;
		}
	}
}

/**
 * Update's each member's game stats in the player stats table according to the results of this game.
 * Such as game count, wins, losses, etc.
 */
async function updatePlayerStatsTable(game: Game, game_id: number, victor: Player | undefined) {

	const playerMoveCounts: PlayerGroup<number> = getPlayerMoveCountsInGame(game);

	// update player_stats entries for each logged in player
	for (const playerStr in game.players) {
		const player: Player = Number(playerStr) as Player;
		const user_id = game.players[playerStr].identifier.user_id;
		if (user_id === undefined) continue; // Guest players don't have a row in the player_stats table for updating

		// Construct the names of the columns that need to be accessed from the player_stats table
		const outcomeString = victor === undefined ? 'invalid' : victor === player ? "wins" : victor === players.NEUTRAL ? "draws" : "losses";
		const publicityString = game.publicity;
		const ratedString = (game.rated ? "rated" : "casual");

		const read_and_modify_columns = ["moves_played"];
		const read_and_increment_columns = victor !== undefined ?
											[ "game_count", `game_count_${ratedString}`, `game_count_${publicityString}`,
											  `game_count_${outcomeString}`, `game_count_${outcomeString}_${ratedString}`]
											: [ "game_count", "game_count_aborted"];
		const read_columns = read_and_modify_columns.concat(read_and_increment_columns);

		// Access the player stats
		const player_stats = getPlayerStatsData(user_id, read_columns);
		if (player_stats === undefined) { // This might occur if they ever deleted their account mid-game.
			console.log(`Not updating stats of deleted member "${game.players[playerStr].identifier.member}" of user_id "${user_id}". Game ID: ${game_id}.`);
			continue; // Continue updating next player's stats, they may not be deleted.
		}

		// Update moves_played
		player_stats.moves_played! += playerMoveCounts[player]!;

		// Update increment counts
		// @ts-ignore
		for (const column of read_and_increment_columns) player_stats[column]++;

		// Push changed player_stats to database
		const results = updatePlayerStatsColumns(user_id, player_stats);

		if (!results.success) {
			await logEventsAndPrint('Failed to increment player stats after game. Check unloggedGames log.', 'errLog.txt');
			const errText = `Error when UPDATING player stats when logging game: ${results.reason}  Member "${game.players[playerStr].identifier.member}", user_id "${user_id}". Their color: ${playerStr}. Game ID: ${game_id}. The game: ${gameutility.getSimplifiedGameString(game)}`;
			await logEvents(errText, 'unloggedGames.txt');
			continue;
		}
	}
}

/**
 * Counts the number of moves each player has made in the game.
 * 
 * TODO: Move to moveutil script, once its dependancies are healthy!!!
 */
function getPlayerMoveCountsInGame(game: Game): PlayerGroup<number> {
	// Optimized to not require iterating through each move in the list.
	const playerMoveCounts: PlayerGroup<number> = {};
	const fullmoves_completed_total = Math.floor(game.moves.length / game.gameRules.turnOrder.length);
	const last_partial_move_length = game.moves.length % game.gameRules.turnOrder.length;
	for (const playerStr in game.players) {
		const player: Player = Number(playerStr) as Player;
		playerMoveCounts[player] = fullmoves_completed_total * game.gameRules.turnOrder.filter((p : Player) => p === player).length;
		playerMoveCounts[player] += game.gameRules.turnOrder
			.slice(0, last_partial_move_length)
			.filter((p : Player) => p === player).length;
	}
	return playerMoveCounts;
}


export default {
	logGame,
};