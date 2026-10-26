// src/server/database/cheatInteractionsManager.ts

/**
 * This script handles queries to the cheat_interactions table: what each player of a rated game
 * did beyond their moves, for engine-assistance detection. Kept permanently, unlike the move
 * evidence, since it can't be re-derived. Read back beside the evidence by cheatAssessmentsManager.
 */

import db from './database.js';

// Types -----------------------------------------------------------------------

/** One player's interaction data from one rated game, as JSON. */
interface CheatInteractionsRecord {
	game_id: number;
	user_id: number;
	interaction: string;
}

// Methods ---------------------------------------------------------------------

/**
 * Records a finished rated game's interaction data, one row per player, in a single transaction.
 * @throws If a database error occurs.
 */
function recordGame(records: CheatInteractionsRecord[]): void {
	const query = `INSERT INTO cheat_interactions (game_id, user_id, interaction) VALUES (?, ?, ?)`;
	db.call(
		() =>
			db.transaction(() => {
				for (const r of records) db.run(query, [r.game_id, r.user_id, r.interaction]);
			})(),
		`Error recording the interaction data of game ${records[0]?.game_id}`,
	);
}

// Exports ---------------------------------------------------------------------

export default { recordGame };
