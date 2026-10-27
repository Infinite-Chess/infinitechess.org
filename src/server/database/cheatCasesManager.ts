// src/server/database/cheatCasesManager.ts

/**
 * This script handles queries to the cheat_cases table: the players engine-assistance
 * detection suspects, each awaiting an admin's decision.
 */

import db from './database.js';

// Methods ---------------------------------------------------------------------

/**
 * Whether the player has an open case.
 * @throws If a database error occurs.
 */
function isOpen(user_id: number): boolean {
	const query = 'SELECT EXISTS(SELECT 1 FROM cheat_cases WHERE user_id = ?) AS found';
	const row = db.call(
		() => db.get<{ found: 0 | 1 }>(query, [user_id]),
		`Error checking for a cheat case of user ${user_id}`,
	);
	return Boolean(row?.found);
}

/**
 * Opens a case on the player.
 * @throws If a database error occurs.
 */
function open(user_id: number, opened_at: number): void {
	db.call(
		() => db.run('INSERT INTO cheat_cases (user_id, opened_at) VALUES (?, ?)', [user_id, opened_at]), // prettier-ignore
		`Error opening a cheat case on user ${user_id}`,
	);
}

// Exports ---------------------------------------------------------------------

export default { isOpen, open };
