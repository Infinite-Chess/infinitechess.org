// src/server/database/cheatAssessmentsManager.ts

/**
 * This script handles queries to the cheat_assessments table: the games engine-assistance
 * detection queued, and each player's move evidence from those it assessed.
 */

import db from './database.js';

// Types -----------------------------------------------------------------------

/** Whether the engine could analyse a game, and if so, the player's evidence from it. */
type AssessmentOutcome =
	| { outcome: 'analysed'; evidence: string }
	| { outcome: 'unsupported' | 'failed'; evidence: null };

/** One player's assessment of one game. */
export type CheatAssessmentsRecord = {
	game_id: number;
	user_id: number;
	updated_at: number;
} & AssessmentOutcome;

/** A player's evidence from one game, with the rating they held going into it. */
interface RecentEvidence {
	game_id: number;
	evidence: string;
	elo_at_game: number;
	rating_deviation_at_game: number;
}

// Methods ---------------------------------------------------------------------

/**
 * Queues a logged game for assessment: one `queued` row per player, in a single transaction.
 * @throws If a database error occurs.
 */
function queueGame(game_id: number, user_ids: number[], updated_at: number): void {
	const query = `INSERT INTO cheat_assessments (game_id, user_id, updated_at, outcome) VALUES (?, ?, ?, 'queued')`; // prettier-ignore
	db.call(
		() =>
			db.transaction(() => {
				for (const user_id of user_ids) db.run(query, [game_id, user_id, updated_at]);
			})(),
		`Error queuing game ${game_id} for cheat assessment`,
	);
}

/**
 * The games still queued, in the order they finished: the work a restart interrupted.
 * @throws If a database error occurs.
 */
function getQueuedGameIds(): number[] {
	const query = `SELECT DISTINCT game_id FROM cheat_assessments WHERE outcome = 'queued' ORDER BY updated_at`; // prettier-ignore
	return db.call(
		() => db.all<{ game_id: number }>(query).map((row) => row.game_id),
		'Error getting queued cheat assessments',
	);
}

/**
 * Records one queued game's assessment, one row per player, in a single transaction.
 * @throws If a database error occurs.
 */
function recordGame(records: CheatAssessmentsRecord[]): void {
	const query = `UPDATE cheat_assessments SET updated_at = ?, outcome = ?, evidence = ? WHERE game_id = ? AND user_id = ?`; // prettier-ignore
	db.call(
		() =>
			db.transaction(() => {
				for (const r of records) db.run(query, [r.updated_at, r.outcome, r.evidence, r.game_id, r.user_id]); // prettier-ignore
			})(),
		`Error recording cheat assessments of game ${records[0]?.game_id}`,
	);
}

/**
 * Marks a game's still-queued rows failed, for an assessment that threw. Recorded rows are kept.
 * @throws If a database error occurs.
 */
function markFailed(game_id: number, updated_at: number): void {
	db.call(
		() => db.run(`UPDATE cheat_assessments SET updated_at = ?, outcome = 'failed' WHERE game_id = ? AND outcome = 'queued'`, [updated_at, game_id]), // prettier-ignore
		`Error marking the cheat assessment of game ${game_id} failed`,
	);
}

/**
 * The evidence from a player's games assessed since `since` (epoch ms), in assessment order, each
 * with the rating they held going into it.
 * @throws If a database error occurs.
 */
function getRecentEvidence(user_id: number, since: number): RecentEvidence[] {
	return db.call(
		() =>
			db.all<RecentEvidence>(
				`SELECT a.game_id, a.evidence, p.elo_at_game, p.rating_deviation_at_game
				FROM cheat_assessments a
				JOIN player_games p ON p.game_id = a.game_id AND p.user_id = a.user_id
				WHERE a.user_id = ? AND a.updated_at >= ? AND a.outcome = 'analysed'
				ORDER BY a.updated_at`,
				[user_id, since],
			),
		`Error getting cheat assessments of user ${user_id}`,
	);
}

// Exports ---------------------------------------------------------------------

export default { queueGame, getQueuedGameIds, recordGame, markFailed, getRecentEvidence };
