// src/server/database/playerGamesManager.ts

/**
 * This script handles queries to the player_games table.
 */

import type { Player } from '../../shared/chess/util/typeutil.js';

import jsutil from '../../shared/util/jsutil.js';

import db, { dbCall } from './database.js';
import { allPlayerGamesColumns } from './databaseTables.js';

// Types ----------------------------------------------------------------------------------------------

/** Structure of a complete player_games record. */
export interface PlayerGamesRecord {
	user_id: number;
	game_id: number;
	player_number: Player;
	score: number | null;
	clock_at_end_millis: number | null;
	elo_at_game: number | null;
	elo_change_from_game: number | null;
}

type PlayerGamesColumn = keyof PlayerGamesRecord;

// Methods --------------------------------------------------------------------------------------------

/**
 * Gets player_games entries for all opponents of a specific user for a list of specific games.
 * ALL GAMES MUST BE BETWEEN TWO PLAYER ONLY, not between guests.
 * @param user_id - The user_id of the player
 * @param game_id_list - A list of game_ids
 * @param columns - The columns to retrieve (e.g., ['user_id', 'player_number'])
 * @returns An array of objects with the requested columns from player_games.
 * @throws If invalid arguments are provided, if fewer rows than expected are found, or if a database error occurs.
 */
function getOpponentsOfUserFromGames<K extends PlayerGamesColumn>(
	user_id: number,
	game_id_list: number[],
	columns: K[],
): Pick<PlayerGamesRecord, K>[] {
	return dbCall(
		() => {
			// Validate the arguments...
			if (!Array.isArray(columns))
				throw new Error(
					`When getting player_games data, columns must be an array of strings! Received: ${jsutil.ensureJSONString(columns)}`,
				);
			if (
				!columns.every(
					(column) =>
						typeof column === 'string' && allPlayerGamesColumns.includes(column),
				)
			)
				throw new Error(
					`Invalid columns requested from player_games table: ${jsutil.ensureJSONString(columns)}`,
				);

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
				throw new Error(
					`Not enough matches found in player_games table for game_ids: ${jsutil.ensureJSONString(game_id_list)}. Expected at least ${game_id_list.length}, found ${rows.length}. Was one of them a guest?`,
				);

			return rows;
		},
		`Error getting all player_games entries for game_id_list "${jsutil.ensureJSONString(game_id_list)}"`,
	);
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
function getRecentNRatedGamesForUser<K extends PlayerGamesColumn>(
	user_id: number,
	leaderboard_id: number,
	limit: number,
	columns: K[],
): Pick<PlayerGamesRecord, K>[] {
	return dbCall(() => {
		// Validate columns argument
		if (!Array.isArray(columns))
			throw new Error(
				`When fetching recent games, columns must be an array of strings! Received: ${jsutil.ensureJSONString(columns)}`,
			);
		if (!columns.every((col) => typeof col === 'string' && allPlayerGamesColumns.includes(col)))
			throw new Error(
				`Invalid columns requested from player_games table: ${jsutil.ensureJSONString(columns)}`,
			);

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

// Exports --------------------------------------------------------------------------------------------

export {
	getOpponentsOfUserFromGames,
	// Commented out to emphasize this should not ever have to be used:
	// updatePlayerGamesColumns,
	getRecentNRatedGamesForUser,
};
