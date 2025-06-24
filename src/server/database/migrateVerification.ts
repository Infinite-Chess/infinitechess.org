// src/server/database/migrateVerification.js


import db from './database.js';


/** Checks if a column exists in a table. */
function columnExists(tableName: string, columnName: string) {
	try {
        // We cannot use the wrapper's prepareStatement cache for PRAGMA queries,
        // so we access the raw db object for this specific, rare operation.
		const result = db.db.prepare(`SELECT 1 FROM pragma_table_info(?) WHERE name = ?`).get(tableName, columnName);
		return !!result;
	} catch (error) {
		console.error(`Error checking if column ${columnName} exists in ${tableName}:`, error);
		return false;
	}
}

/**
 * Ensures the 'members' table has the new columns for the verification refactor.
 * This function is idempotent and safe to run on every server startup.
 */
export function expandMembersTableForVerification() {
	console.log("Checking 'members' table for verification refactor columns...");

	try {
        // For ALTER TABLE, we must use the raw db.exec() method because it cannot be a prepared statement.
		if (!columnExists('members', 'is_verified')) {
			db.db.exec(`ALTER TABLE members ADD COLUMN is_verified INTEGER NOT NULL DEFAULT 0;`);
			console.log("Migration: Added 'is_verified' column.");
		}
		if (!columnExists('members', 'verification_code')) {
			db.db.exec(`ALTER TABLE members ADD COLUMN verification_code TEXT;`);
			console.log("Migration: Added 'verification_code' column.");
		}
		if (!columnExists('members', 'is_verification_notified')) {
			db.db.exec(`ALTER TABLE members ADD COLUMN is_verification_notified INTEGER NOT NULL DEFAULT 0;`);
			console.log("Migration: Added 'is_verification_notified' column.");
		}
	} catch (error) {
		console.error('CRITICAL: Failed to alter "members" table for verification refactor!', error);
	}
}