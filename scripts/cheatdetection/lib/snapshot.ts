// scripts/cheatdetection/lib/snapshot.ts

/**
 * Read-only access to a copy of prod's database: the games the research analyses, and their
 * players. Of member data it reads only which accounts were deleted for rating abuse.
 */

import type { Player } from '../../../src/shared/chess/util/typeutil.js';

import Database from 'better-sqlite3';

import settings from './settings.js';

// Types -----------------------------------------------------------------------

// Prod's schema, which can lag the database managers' records: not derived from them.

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

/** One player's seat in one game, with the game's columns. */
interface SeatRow {
	user_id: number;
	game_id: number;
	date: string;
	rated: number;
	termination: string;
	icn: string;
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

/** The research corpus: the games production assesses, less rating abusers', in id order. */
function corpus(): GameRow[] {
	return open()
		.prepare<[], GameRow>(
			`SELECT ${GAME_COLUMNS} FROM games WHERE rated = 1 AND termination != 'aborted'
			AND game_id NOT IN (
				SELECT game_id FROM player_games JOIN deleted_members USING (user_id)
				WHERE reason_deleted = 'rating abuse'
			) ORDER BY game_id`,
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

/** Every seat of every member who has played a rated game, in any of their games. */
function ratedPlayersSeats(): SeatRow[] {
	return open()
		.prepare<[], SeatRow>(
			`SELECT pg.user_id, g.game_id, g.date, g.rated, g.termination, g.icn
			FROM player_games pg JOIN games g USING (game_id)
			WHERE pg.user_id IN (SELECT user_id FROM player_games JOIN games USING (game_id) WHERE rated = 1)`,
		)
		.all();
}

// Exports ---------------------------------------------------------------------

export default {
	corpus,
	game,
	ratedGames,
	players,
	ratedPlayersSeats,
};
