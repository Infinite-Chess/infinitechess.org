// src/server/database/playerStatsManager.ts

/**
 * This script handles queries to the player_stats table, which holds one row per member
 * counting their lifetime games, sliced by outcome, rated/casual and public/private.
 *
 * The counters are accumulated, never derived: a concluded game adds to them, and an
 * overturned one subtracts the same amounts back off.
 */

import db from './database.js';

// Types -----------------------------------------------------------------------

/** Structure of a complete player_stats record. */
interface PlayerStatsRecord {
	user_id: number;
	moves_played: number;
	game_count: number;
	game_count_rated: number;
	game_count_casual: number;
	game_count_public: number;
	game_count_private: number;
	game_count_wins: number;
	game_count_losses: number;
	game_count_draws: number;
	game_count_aborted: number;
	game_count_wins_rated: number;
	game_count_losses_rated: number;
	game_count_draws_rated: number;
	game_count_wins_casual: number;
	game_count_losses_casual: number;
	game_count_draws_casual: number;
}

type PlayerStatsColumn = keyof PlayerStatsRecord;

/** How a game ended for one player, naming the counter group it increments. */
export type PlayerOutcome = 'wins' | 'losses' | 'draws' | 'aborted';

/** One game's contribution to a player's tallies. */
interface GameDelta {
	moves_played_increment: number;
	outcome: PlayerOutcome;
	is_rated: boolean;
	is_private: boolean;
	/** `1` counts the game (logging it), `-1` un-counts it (reversing an overturned one). */
	sign: 1 | -1;
}

// Methods ---------------------------------------------------------------------

/**
 * Creates a member's stats row, every counter at zero.
 * @throws If a database error occurs.
 */
function insert(user_id: number): void {
	db.call(
		() => db.run('INSERT INTO player_stats (user_id) VALUES (?)', [user_id]),
		`Error inserting player_stats row for user_id "${user_id}"`,
	);
}

/**
 * Fetches the requested columns of one member's stats row.
 * @returns The row, or `undefined` if the account no longer exists.
 * @throws If invalid arguments are provided, or if a database error occurs.
 */
function getData<K extends PlayerStatsColumn>(
	user_id: number,
	columns: K[],
): Pick<PlayerStatsRecord, K> | undefined {
	return db.call(() => {
		db.assertColumnsValid(columns, 'player_stats');

		const query = `SELECT ${columns.join(', ')} FROM player_stats WHERE user_id = ?`;
		return db.get<Pick<PlayerStatsRecord, K>>(query, [user_id]);
	}, `Error getting player_stats of user_id "${user_id}"`);
}

/**
 * Applies one game's deltas to a member's counters, in whichever direction `sign` points.
 * @throws If the member has no stats row, or if a database error occurs.
 */
function applyGameDelta(user_id: number, delta: GameDelta): void {
	db.call(() => {
		const op = delta.sign === 1 ? '+' : '-'; // The arithmetic operator applied to every counter.

		const setClauses: string[] = [`moves_played = moves_played ${op} ?`, `game_count = game_count ${op} 1`]; // prettier-ignore
		const values: (number | string)[] = [delta.moves_played_increment];

		if (delta.outcome === 'aborted') {
			setClauses.push(`game_count_aborted = game_count_aborted ${op} 1`);
		} else {
			const ratedString: 'rated' | 'casual' = delta.is_rated ? 'rated' : 'casual';
			const publicity: 'public' | 'private' = delta.is_private ? 'private' : 'public';
			const outcome = delta.outcome;
			// The rated/casual, public/private, win/loss/draw, and combined outcome+rated/casual counters.
			setClauses.push(`game_count_${ratedString} = game_count_${ratedString} ${op} 1`);
			setClauses.push(`game_count_${publicity} = game_count_${publicity} ${op} 1`);
			setClauses.push(`game_count_${outcome} = game_count_${outcome} ${op} 1`);
			setClauses.push(`game_count_${outcome}_${ratedString} = game_count_${outcome}_${ratedString} ${op} 1`); // prettier-ignore
		}

		const query = `UPDATE player_stats SET ${setClauses.join(', ')} WHERE user_id = ?`;
		values.push(user_id);

		const result = db.run(query, values);
		if (result.changes === 0) {
			// Unreachable: account deletion logs and finalizes their live game BEFORE the
			// members row cascades this one away. Reaching it means that order broke.
			throw new Error(`CRITICAL: User ${user_id} has no player_stats row during a stats update.`); // prettier-ignore
		}
	}, `Error applying a game's stat deltas for user_id "${user_id}"`);
}

// Exports ---------------------------------------------------------------------

export default {
	// Methods
	insert,
	getData,
	applyGameDelta,
};
