// src/server/database/cheatAssessmentsManager.int.test.ts

/**
 * Pins cheatAssessmentsManager's queries in the in-memory database: queued games read back in the
 * order they were queued whatever their random ids, assessed games leave the queue, and a player's
 * evidence reads back with their interaction data within its window, oldest first, unanalysed
 * games included.
 */

import type { CheatAssessmentsRecord } from './cheatAssessmentsManager.js';

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';

import db from './database.js';
import databaseInit from './databaseInit.js';
import databaseTables from './databaseTables.js';
import cheatAssessmentsManager from './cheatAssessmentsManager.js';
import cheatInteractionsManager from './cheatInteractionsManager.js';

/** The user ids of every game's two players, white first. */
const USER_IDS = [1, 2];
/** Every player's interaction data: any JSON, as the table stores it as given. */
const INTERACTION = '{"stored":"as given"}';

/** Logs a rated game between the two players, as the games and player_games tables hold it. */
function addGame(game_id: number): void {
	db.run(`INSERT INTO games (game_id, date, variant, rated, private, result, termination, move_count, icn) VALUES (?, '2026-10-20 00:00:00', 'Classical', 1, 0, '1-0', 'checkmate', 20, '')`, [game_id]); // prettier-ignore
	for (const [i, user_id] of USER_IDS.entries()) db.run('INSERT INTO player_games (user_id, game_id, player_number, elo_at_game, rating_deviation_at_game) VALUES (?, ?, ?, 1500, 100)', [user_id, game_id, i + 1]); // prettier-ignore
}

/** Records a game as analysed for both players at `updated_at`. */
function recordAnalysed(game_id: number, updated_at: number): void {
	const records: CheatAssessmentsRecord[] = USER_IDS.map((user_id) => ({ game_id, user_id, updated_at, outcome: 'analysed', evidence: '[]' })); // prettier-ignore
	cheatAssessmentsManager.recordGame(records);
}

describe('cheatAssessmentsManager', () => {
	beforeAll(() => {
		databaseInit.buildSchema();
	});

	beforeEach(() => {
		databaseTables.clear();
		// Random ids, queued in this order.
		for (const [game_id, queued_at] of [
			[9000, 1000],
			[42, 2000],
			[500, 3000],
		] as const) {
			addGame(game_id);
			cheatAssessmentsManager.queueGame(game_id, USER_IDS, queued_at);
			const interactions = USER_IDS.map((user_id) => ({ game_id, user_id, interaction: INTERACTION })); // prettier-ignore
			cheatInteractionsManager.recordGame(interactions);
		}
	});

	it('restores the queue in the order games were queued, whatever their ids', () => {
		expect(cheatAssessmentsManager.getQueuedGameIds()).toEqual([9000, 42, 500]);
	});

	it('drops analysed and failed games from the queue', () => {
		recordAnalysed(9000, 4000);
		cheatAssessmentsManager.markFailed(42, 5000);
		expect(cheatAssessmentsManager.getQueuedGameIds()).toEqual([500]);
	});

	it('keeps a recorded game when marking it failed', () => {
		recordAnalysed(9000, 4000);
		cheatAssessmentsManager.markFailed(9000, 5000);
		expect(cheatAssessmentsManager.getRecentEvidence(1, 0).map((row) => row.game_id)).toEqual([9000]); // prettier-ignore
	});

	it('reads a failed game back with its interaction data, but no evidence', () => {
		cheatAssessmentsManager.markFailed(42, 5000);
		const [row] = cheatAssessmentsManager.getRecentEvidence(1, 0);
		expect(row).toMatchObject({ game_id: 42, evidence: null, interaction: INTERACTION }); // prettier-ignore
	});

	it("reads a player's assessed games within the window, oldest first", () => {
		recordAnalysed(500, 4000);
		recordAnalysed(9000, 6000);
		const gameIds = (since: number): number[] => cheatAssessmentsManager.getRecentEvidence(1, since).map((row) => row.game_id); // prettier-ignore
		expect(gameIds(0)).toEqual([500, 9000]);
		expect(gameIds(5000)).toEqual([9000]);
	});
});
