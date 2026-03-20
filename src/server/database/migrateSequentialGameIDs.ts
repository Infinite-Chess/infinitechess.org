// src/server/database/migrateSequentialGameIDs.ts

/**
 * TEMPORARY ONE-TIME MIGRATION — DELETE THIS FILE AND ITS CALL SITE IN server.ts AFTER RUNNING ON PRODUCTION.
 *
 * Background: When game logs were first migrated from the text file gameLog.txt into the database,
 * a bug caused game.id to be undefined for every migrated game. SQLite auto-assigned sequential
 * rowids (1, 2, 3, ...) for all ~35,503 of those games. All games logged after that point already
 * receive a properly random game_id. This migration reassigns random IDs to the sequential ones.
 *
 * Strategy:
 * - All new IDs are pre-generated in memory before any DB writes occur.
 *   genUniqueGameID() queries the DB each call, so while IDs 1–35503 still exist in the table,
 *   it will never return any of them — no explicit range exclusion needed.
 * - New IDs are also checked against other IDs already chosen for this batch (intra-batch collisions).
 * - Both `games.game_id` and `player_games.game_id` are updated together for each game.
 *   FK enforcement is disabled for the duration because the FK has no ON UPDATE CASCADE.
 */

import db from './database.js';
import { genUniqueGameID } from './gamesManager.js';

/** Upper bound (inclusive) of the sequential ID range produced by the buggy migration. */
const SEQUENTIAL_RANGE_MAX = 35_503; // Used only in the SELECT query to identify which games need reassignment.

/**
 * TEMPORARY ONE-TIME MIGRATION — Call once on production, then delete this file and its call site.
 *
 * Reassigns random game_ids to all games whose id falls within [1, SEQUENTIAL_RANGE_MAX].
 * Updates both `games.game_id` and `player_games.game_id` atomically per game.
 */
function migrateSequentialGameIDs(): void {
	// Fetch all game_ids that need reassignment.
	const sequentialGames = db.all<{ game_id: number }>(
		'SELECT game_id FROM games WHERE game_id BETWEEN 1 AND ?',
		[SEQUENTIAL_RANGE_MAX],
	);

	if (sequentialGames.length === 0) {
		console.log(
			'migrateSequentialGameIDs: No sequential game IDs found — migration already complete or not needed. Remove this migration.',
		);
		return;
	}

	console.log(
		`migrateSequentialGameIDs: Found ${sequentialGames.length} sequential game IDs to reassign...`,
	);

	// Pre-generate all new IDs before touching the database.
	// genUniqueGameID() ensures each ID is unique against all game_ids currently in the DB.
	// Since IDs 1–35503 still exist in the table at this point, genUniqueGameID() will never
	// return any of them — no explicit range exclusion is needed.
	// We additionally track already-chosen IDs to avoid intra-batch collisions.
	const idMap = new Map<number, number>(); // old_id -> new_id
	const reservedNewIds = new Set<number>();

	for (const { game_id: oldId } of sequentialGames) {
		let newId: number;
		do {
			newId = genUniqueGameID();
		} while (reservedNewIds.has(newId)); // guard against intra-batch collisions
		idMap.set(oldId, newId);
		reservedNewIds.add(newId);
	}

	// Disable FK enforcement so we can update the PK in-place.
	// (player_games.game_id references games(game_id) with ON DELETE CASCADE but no ON UPDATE CASCADE)
	db.run('PRAGMA foreign_keys = OFF');
	try {
		const migrate = db.transaction(() => {
			for (const [oldId, newId] of idMap) {
				db.run('UPDATE games SET game_id = ? WHERE game_id = ?', [newId, oldId]);
				db.run('UPDATE player_games SET game_id = ? WHERE game_id = ?', [newId, oldId]);
			}
		});
		migrate();
		console.log(
			`migrateSequentialGameIDs: Successfully reassigned ${idMap.size} game IDs. Remove this migration.`,
		);
	} finally {
		// Always re-enable FK enforcement, even if the transaction fails and rolls back.
		db.run('PRAGMA foreign_keys = ON');
	}
}

export { migrateSequentialGameIDs };
