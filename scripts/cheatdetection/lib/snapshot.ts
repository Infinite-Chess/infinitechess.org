// scripts/cheatdetection/lib/snapshot.ts

/**
 * Read-only access to a copy of prod's database: the games the research analyses, and their
 * players. Reads only the games and player_games tables, never any member data.
 */

import type { Player } from '../../../src/shared/chess/util/typeutil.js';

import Database from 'better-sqlite3';

import settings from './settings.js';

// Types -----------------------------------------------------------------------

/** The columns of a games row the research reads. */
export interface GameRow {
	game_id: number;
	date: string;
	base_time_seconds: number | null;
	increment_seconds: number | null;
	leaderboard_id: number | null;
	time_duration_millis: number | null;
	icn: string;
}

/** The columns of a player_games row the research reads. */
interface PlayerRow {
	user_id: number;
	game_id: number;
	player_number: Player;
	score: number | null;
	elo_at_game: number | null;
	elo_change_from_game: number | null;
}

// Constants -------------------------------------------------------------------

/** The games columns of a {@link GameRow}. */
const GAME_COLUMNS = 'game_id, date, base_time_seconds, increment_seconds, leaderboard_id, time_duration_millis, icn'; // prettier-ignore

// State -----------------------------------------------------------------------

let db: Database.Database | undefined;

// Queries ---------------------------------------------------------------------

/** The snapshot, opened read-only on first use. */
function open(): Database.Database {
	db ??= new Database(settings.snapshotPath(), { readonly: true, fileMustExist: true });
	return db;
}

/** The research corpus: rated, unaborted games of 16+ plies, in id order. */
function corpus(): GameRow[] {
	return open()
		.prepare<[], GameRow>(
			`SELECT ${GAME_COLUMNS} FROM games WHERE rated = 1 AND termination != 'aborted' AND move_count >= 16
			ORDER BY game_id`,
		)
		.all();
}

/** One game by its id. */
function game(game_id: number): GameRow {
	return open()
		.prepare<[number], GameRow>(`SELECT ${GAME_COLUMNS} FROM games WHERE game_id = ?`)
		.get(game_id)!;
}

/** Every rated game, for replaying ratings. */
function ratedGames(): GameRow[] {
	return open().prepare<[], GameRow>(`SELECT ${GAME_COLUMNS} FROM games WHERE rated = 1`).all();
}

/** A game's players, white first. */
function players(game_id: number): PlayerRow[] {
	return open()
		.prepare<
			[number],
			PlayerRow
		>('SELECT user_id, game_id, player_number, score, elo_at_game, elo_change_from_game FROM player_games WHERE game_id = ? ORDER BY player_number')
		.all(game_id);
}

// Exports ---------------------------------------------------------------------

export default {
	corpus,
	game,
	ratedGames,
	players,
};
