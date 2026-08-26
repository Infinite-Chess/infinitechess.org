// src/server/database/playerGamesManager.ts

/**
 * This script handles queries to the player_games table.
 */

import type { Player } from '../../shared/util/typeutil.js';

import jsonutil from '../../shared/util/jsonutil.js';

import db from './database.js';

// Types -----------------------------------------------------------------------

/** Structure of a complete player_games record. */
export interface PlayerGamesRecord {
	user_id: number;
	game_id: number;
	player_number: number;
	score: number | null;
	elo_at_game: number | null;
	elo_change_from_game: number | null;
	rating_deviation_at_game: number | null;
	rating_deviation_after_game: number | null;
}

type PlayerGamesColumn = keyof PlayerGamesRecord;

// Methods ---------------------------------------------------------------------

/**
 * Gets player_games entries for all opponents of a specific user for a list of specific games.
 * ALL GAMES MUST BE BETWEEN TWO PLAYER ONLY, not between guests.
 * @param user_id - The user_id of the player
 * @param game_id_list - A list of game_ids
 * @param columns - The columns to retrieve (e.g., ['user_id', 'player_number'])
 * @returns An array of objects with the requested columns from player_games.
 * @throws If invalid arguments are provided, if fewer rows than expected are found, or if a database error occurs.
 */
function getOpponentsOfUser<K extends PlayerGamesColumn>(
	user_id: number,
	game_id_list: number[],
	columns: K[],
): Pick<PlayerGamesRecord, K>[] {
	return db.call(
		() => {
			db.assertColumnsValid(columns, 'player_games');

			// Move onto the SQL query
			const placeholders = game_id_list.map(() => '?').join(', ');
			const query = `
			SELECT ${columns.join(', ')}
			FROM player_games
			WHERE user_id != ?
				AND game_id IN (${placeholders})
		`;
			const rows = db.all<Pick<PlayerGamesRecord, K>>(query, [user_id, ...game_id_list]);

			// Every requested game should have at least one opponent row.
			if (rows.length < game_id_list.length)
				throw new Error(`Not enough matches found in player_games table for game_ids: ${jsonutil.ensureJSONString(game_id_list)}. Expected at least ${game_id_list.length}, found ${rows.length}. Was one of them a guest?`); // prettier-ignore

			return rows;
		},
		`Error getting all player_games entries for game_id_list "${jsonutil.ensureJSONString(game_id_list)}"`,
	);
}

/**
 * Fetches the requested columns of every player_games row for a single game.
 * @returns One row per signed-in player (guests have no row).
 * @throws If invalid arguments are provided, or if a database error occurs.
 */
function getOfGame<K extends PlayerGamesColumn>(
	game_id: number,
	columns: K[],
): Pick<PlayerGamesRecord, K>[] {
	return db.call(() => {
		db.assertColumnsValid(columns, 'player_games');

		const query = `SELECT ${columns.join(', ')} FROM player_games WHERE game_id = ?`;
		return db.all<Pick<PlayerGamesRecord, K>>(query, [game_id]);
	}, `Error getting player_games entries for game_id "${game_id}"`);
}

/**
 * Retrieves the most recent N rated entries for a user on a specific leaderboard, returning only the specified columns from player_games.
 * Aborted games (where score is null) are skipped.
 * @param user_id - The ID of the user
 * @param leaderboard_id - The ID of the leaderboard to filter rated games
 * @param limit - Maximum number of recent games to fetch
 * @param columns - Array of column names from player_games to return (e.g., ['game_id', 'score']).
 * @returns Array of objects containing only the requested columns.
 * @throws If invalid arguments are provided, or if a database error occurs.
 */
function getRecentNRatedForUser<K extends PlayerGamesColumn>(
	user_id: number,
	leaderboard_id: number,
	limit: number,
	columns: K[],
): Pick<PlayerGamesRecord, K>[] {
	return db.call(() => {
		db.assertColumnsValid(columns, 'player_games');

		// Move on to the SQL query
		const selectClause = columns.map((col) => `pg.${col}`).join(', ');
		const query = `
			SELECT ${selectClause}
			FROM player_games pg
			JOIN games g ON g.game_id = pg.game_id
			WHERE pg.user_id = ?
			  AND g.rated = 1
			  AND g.leaderboard_id = ?
			  AND pg.score IS NOT NULL
			ORDER BY g.date DESC
			LIMIT ?
		`;
		return db.all<Pick<PlayerGamesRecord, K>>(query, [user_id, leaderboard_id, limit]);
	}, `Error fetching recent rated games for user ${user_id} on leaderboard ${leaderboard_id}`);
}

// Writes ----------------------------------------------------------------------

// These intentionally skip `dbCall`. gameLogger is their only caller, and it already logs the
// failure and rolls back the surrounding transaction — wrapping them would log the same error twice.

/**
 * Inserts one player's row for a game. Guests have no row.
 * @throws If a database error occurs.
 */
function insert(record: PlayerGamesRecord): void {
	const query = `
		INSERT INTO player_games (
			user_id, game_id, player_number, score,
			elo_at_game, elo_change_from_game,
			rating_deviation_at_game, rating_deviation_after_game
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`;
	db.run(query, [
		record.user_id, record.game_id, record.player_number, record.score,
		record.elo_at_game, record.elo_change_from_game,
		record.rating_deviation_at_game, record.rating_deviation_after_game,
	]); // prettier-ignore
}

/**
 * Updates specific columns of a single player's row for a game.
 * Used when a cheat report overturns an already-logged game.
 * @param game_id - The game the row belongs to.
 * @param player_number - Which player's row to update.
 * @param updates - Only the columns to change and their new values. Keys of the primary key are not updatable.
 * @throws If invalid arguments are provided, or if a database error occurs.
 */
function update(game_id: number, player_number: Player, updates: Partial<PlayerGamesRecord>): void {
	db.runRowUpdate({
		tableName: 'player_games',
		excludedColumns: ['user_id', 'game_id', 'player_number'],
		updates,
		errorContext: `updating player_games row (game ${game_id}, player ${player_number})`,
		whereClause: 'game_id = ? AND player_number = ?',
		whereValues: [game_id, player_number],
	});
}

// Exports ---------------------------------------------------------------------

export default {
	// Methods
	getOpponentsOfUser,
	getOfGame,
	getRecentNRatedForUser,
	// Writes
	insert,
	update,
};
