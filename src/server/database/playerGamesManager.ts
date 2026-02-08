// src/server/database/playerGamesManager.ts

/**
 * This script handles queries to the player_games table.
 */

import type { Player } from '../../shared/chess/util/typeutil.js';

import jsutil from '../../shared/util/jsutil.js';

import db from './database.js';
import { logEventsAndPrint } from '../middleware/logEvents.js'; // Adjust path if needed
import { allPlayerGamesColumns } from './databaseTables.js';

// Types ----------------------------------------------------------------------------------------------

/** Structure of a complete player_games record. */
interface PlayerGamesRecord {
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
 * Gets player_games entries for all opponents of a specific user for a list of specific games
 * @param user_id - The user_id of the player
 * @param game_id_list - A list of game_ids
 * @param columns - The columns to retrieve (e.g., ['user_id', 'player_number'])
 * @returns An array of objects with the requested columns from player_games.
 */
function getOpponentsOfUserFromGames<K extends PlayerGamesColumn>(
	user_id: number,
	game_id_list: number[],
	columns: K[],
): Pick<PlayerGamesRecord, K>[] {
	// Guard clauses... Validating the arguments...

	if (!Array.isArray(columns)) {
		logEventsAndPrint(
			`When getting player_games data, columns must be an array of strings! Received: ${jsutil.ensureJSONString(columns)}`,
			'errLog.txt',
		);
		return [];
	}
	if (
		!columns.every(
			(column) => typeof column === 'string' && allPlayerGamesColumns.includes(column),
		)
	) {
		logEventsAndPrint(
			`Invalid columns requested from player_games table: ${jsutil.ensureJSONString(columns)}`,
			'errLog.txt',
		);
		return [];
	}

	// Construct SQL query
	const placeholders = game_id_list.map(() => '?').join(', ');
	const query = `
		SELECT ${columns.join(', ')}
		FROM player_games
		WHERE user_id != ?
			AND game_id IN (${placeholders})
	`;

	try {
		// Execute the query and fetch result
		const rows = db.all<Pick<PlayerGamesRecord, K>>(query, [user_id, ...game_id_list]);

		// If no rows found, return undefined
		if (!rows || rows.length === 0) {
			logEventsAndPrint(
				`No matches found in player_games table for game_ids: ${jsutil.ensureJSONString(game_id_list)}.`,
				'errLog.txt',
			);
			return [];
		}

		// Return the fetched rows (single object)
		return rows;
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(
			`Error getting all player_games entries for game_id_list "${jsutil.ensureJSONString(game_id_list)}": ${message}`,
			'errLog.txt',
		);
		return [];
	}
}

/**
 * Retrieves the most recent N rated entries for a user on a specific leaderboard, returning only the specified columns from player_games.
 * Aborted games (where score is null) are skipped.
 * @param user_id - The ID of the user
 * @param leaderboard_id - The ID of the leaderboard to filter rated games
 * @param limit - Maximum number of recent games to fetch
 * @param columns - Array of column names from player_games to return (e.g., ['game_id', 'score']).
 * @returns Array of objects containing only the requested columns.
 */
function getRecentNRatedGamesForUser<K extends PlayerGamesColumn>(
	user_id: number,
	leaderboard_id: number,
	limit: number,
	columns: K[],
): Pick<PlayerGamesRecord, K>[] {
	// Validate columns argument
	if (!Array.isArray(columns)) {
		logEventsAndPrint(
			`When fetching recent games, columns must be an array of strings! Received: ${jsutil.ensureJSONString(columns)}`,
			'errLog.txt',
		);
		return [];
	}
	if (!columns.every((col) => typeof col === 'string' && allPlayerGamesColumns.includes(col))) {
		logEventsAndPrint(
			`Invalid columns requested from player_games table: ${jsutil.ensureJSONString(columns)}`,
			'errLog.txt',
		);
		return [];
	}

	// Dynamically build SELECT clause from requested columns
	const selectClause = columns.map((col) => `pg.${col}`).join(', ');

	// Only include rated, non-aborted games on the specified leaderboard, sorted by game date
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

	try {
		// Bind parameters: user, leaderboard, and limit
		return db.all<Pick<PlayerGamesRecord, K>>(query, [user_id, leaderboard_id, limit]);
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(
			`Error fetching recent rated games for user ${user_id} on leaderboard ${leaderboard_id}: ${message}`,
			'errLog.txt',
		);
		return [];
	}
}

// Exports --------------------------------------------------------------------------------------------

export type { PlayerGamesRecord };

export {
	getOpponentsOfUserFromGames,
	// Commented out to emphasize this should not ever have to be used:
	// updatePlayerGamesColumns,
	getRecentNRatedGamesForUser,
};
