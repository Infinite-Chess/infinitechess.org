// src/server/database/migrateVerification.ts

import db from './database.js';


// Define the structure of the old verification JSON for type safety
type OldVerification = {
	verified: false,
	code: string,
} | {
	verified: true,
	notified: false,
};

// Define the structure of the member row we're fetching
type MemberWithOldVerification = {
    user_id: number;
    verification: string | null;
}

/**
 * Performs a one-time, full migration of the old 'verification' column to the new
 * structured columns, and then drops the old column.
 * This function is idempotent; it will exit early if the 'verification' column no longer exists.
 */
export function performFullVerificationMigration(): void {
	// A. Check if the migration is already complete by looking for the old column.
	if (!db.columnExists('members', 'verification')) {
		// The old column is gone, so our work here is done.
		return;
	}

	console.log("MIGRATION: Starting full verification data migration process...");

	try {
		// B. Create the new required columns if they don't exist.
		console.log("MIGRATION: Step B - Ensuring new columns exist...");
		if (!db.columnExists('members', 'is_verified')) {
			db.db.exec(`ALTER TABLE members ADD COLUMN is_verified INTEGER NOT NULL DEFAULT 0;`);
		}
		if (!db.columnExists('members', 'verification_code')) {
			db.db.exec(`ALTER TABLE members ADD COLUMN verification_code TEXT;`);
		}
		if (!db.columnExists('members', 'is_verification_notified')) {
			db.db.exec(`ALTER TABLE members ADD COLUMN is_verification_notified INTEGER NOT NULL DEFAULT 0;`);
		}

		// C. Migrate the data from the verification column to the new columns.
		console.log("MIGRATION: Step C - Migrating data to new columns...");
		const users = db.all<MemberWithOldVerification>(`SELECT user_id, verification FROM members`);
		let nonNullUsers = 0;

		// Prepare all possible update statements.
		const stmtVerifiedNotified = db.db.prepare('UPDATE members SET is_verified = 1, is_verification_notified = 1 WHERE user_id = ?');
		const stmtVerifiedUnnotified = db.db.prepare('UPDATE members SET is_verified = 1, is_verification_notified = 0, verification_code = NULL WHERE user_id = ?');
		const stmtUnverified = db.db.prepare('UPDATE members SET is_verified = 0, verification_code = ? WHERE user_id = ?');

		// Use a transaction for the entire data migration to ensure atomicity.
		const migrateTransaction = db.db.transaction(() => {
			for (const user of users) {
				if (user.verification === null) {
					// Case: NULL means verified and notified.
					stmtVerifiedNotified.run(user.user_id);
					continue;
				}
				nonNullUsers++;
				try {
					const verificationObj: OldVerification = JSON.parse(user.verification);
					if (verificationObj.verified === true) {
						// Case: { verified: true, notified: false }
						if (verificationObj.notified) throw Error(`User ${user.user_id} is verification notified but cell is still stringified json instead of NULL?`);
						stmtVerifiedUnnotified.run(user.user_id);
					} else {
						// Case: { verified: false, code: '...' }
						if (verificationObj.code === undefined) throw Error(`User ${user.user_id} is not verified, but code isn't present?`);
						stmtUnverified.run(verificationObj.code, user.user_id);
					}
				} catch (e) {
					console.error(`MIGRATION: Failed to parse JSON for user ${user.user_id}. Data: "${user.verification}". Skipping.`);
				}
			}
		});
		
		migrateTransaction(); // Execute the transaction.
		console.log(`MIGRATION: Data migration completed for ${users.length} users with ${nonNullUsers} containing non-null verification statuses.`);

		// D. Drop the verification column.
		console.log("MIGRATION: Step D - Dropping old 'verification' column...");
		// Note: The specific version of better-sqlite3 may affect DROP COLUMN support.
		// It relies on SQLite 3.35.0+
		db.db.exec(`ALTER TABLE members DROP COLUMN verification;`);
		console.log("MIGRATION: 'verification' column dropped successfully.");

		console.log("MIGRATION: Full verification migration process finished.");

	} catch (error) {
		console.error("CRITICAL: Verification migration failed.", error);
	}
}