/**
 * A one-time-use script to migrate refresh tokens from the `members.refresh_tokens`
 * JSON column to the new, normalized `refresh_tokens` table.
 */

// Import your custom database wrapper
import dbWrapper from './database.js';

// Destructure the functions and the raw db instance we need from your wrapper
const { db, all, run } = dbWrapper;

type MemberWithTokens = {
    user_id: number;
    username: string;
    refresh_tokens: string | null;
};

// Type for refresh token object
interface RefreshTokenObject {
	/** The actual JWT refresh token */
	token: string;
	/** ISO 8601 timestamp string when the token was issued */
	issued: string;
	/** ISO 8601 timestamp string when the token will expire */
	expires: string;
	/** The last connected IP address that used this refresh token */
	IP: string;
}

/**
 * Migrates all refresh tokens from the JSON string in the `members` table
 * to the new dedicated `refresh_tokens` table.
 * If the `refresh_tokens` column does not exist in the `members` table,
 * the data migration portion is skipped.
 * The column will still be attempted to be dropped if it exists.
 */
export function migrateRefreshTokensToTable(): void {
	console.log('Starting refresh token migration check...');

	// --- NEW: Check if the legacy column exists first ---
	let legacyColumnExists = false;
	try {
		type ColumnInfo = { name: string; [key: string]: any; };
		const columns = db.pragma('table_info(members)') as ColumnInfo[];
		legacyColumnExists = columns.some(col => col.name === 'refresh_tokens');
	} catch (e) {
		console.error('[MIGRATION_ERROR] Failed to check table structure for `members`. Aborting migration.', e);
		return; // Cannot proceed without knowing table structure
	}

	if (!legacyColumnExists) {
		console.log('Legacy `refresh_tokens` column not found in `members` table. Data migration skipped.');
		// We might still want to ensure the column is dropped if it somehow reappears,
		// or if this check is solely for skipping the data migration part.
		// For now, let's proceed to the cleanup step which will also check.
	} else {
		// --- Existing migration logic (Steps 1-4) only if column exists ---
		console.log('Legacy `refresh_tokens` column found. Proceeding with data migration...');

		// 1. Get all members using your wrapper's 'all' function.
		const membersToMigrate = all<MemberWithTokens>(`
            SELECT user_id, username, refresh_tokens 
            FROM members 
            WHERE refresh_tokens IS NOT NULL AND refresh_tokens != '' AND refresh_tokens != '[]'
        `);

		if (membersToMigrate.length === 0) {
			console.log('No members with legacy refresh tokens found (column exists but no data). Data migration effectively skipped.');
			// Proceed to column drop
		} else {
			console.log(`Found ${membersToMigrate.length} members with tokens to migrate.`);

			// 2. Prepare the INSERT statement
			const insertStmt = db.prepare(`
                INSERT INTO refresh_tokens (token, user_id, created_at, expires_at, ip_address)
                VALUES (@token, @user_id, @created_at, @expires_at, @ip_address)
                ON CONFLICT(token) DO NOTHING
            `);

			let migratedTokenCount = 0;
			let failedUserCount = 0;

			// 3. Use the raw db instance to create a complex transaction.
			const migrateUserTokens = db.transaction((member: MemberWithTokens) => {
				// ... (rest of your existing transaction logic: parsing, looping, inserting)
				// ... (make sure to use 'member.refresh_tokens' safely as it might be null/undefined)
				let parsedTokens: RefreshTokenObject[];
				try {
					if (!member.refresh_tokens) return; // Should be caught by SQL WHERE, but good safeguard
					parsedTokens = JSON.parse(member.refresh_tokens);
				} catch (e) {
					console.error(`[MIGRATION_ERROR] Failed to parse JSON for user: ${member.username} (ID: ${member.user_id}). Skipping.`, e);
					failedUserCount++;
					return;
				}

				if (!Array.isArray(parsedTokens) || parsedTokens.length === 0) {
					return;
				}

				for (const tokenObj of parsedTokens) {
					try {
						if (!tokenObj.token || !tokenObj.issued || !tokenObj.expires) {
							console.warn(`[MIGRATION_WARN] Skipping malformed token object for user ${member.username} (ID: ${member.user_id}). Token:`, tokenObj);
							continue;
						}
						
						const issued_ms = new Date(tokenObj.issued).getTime();
						const expires_ms = new Date(tokenObj.expires).getTime();

						console.log(`Token expires in days: ${(expires_ms - Date.now()) / (1000 * 60 * 60 * 24)} for user ${member.username} (ID: ${member.user_id})`);
						
						insertStmt.run({
							token: tokenObj.token,
							user_id: member.user_id,
							created_at: issued_ms,
							expires_at: expires_ms,
							ip_address: tokenObj.IP,
						});
						migratedTokenCount++;
					} catch (err) {
						console.error(`[MIGRATION_ERROR] Failed to insert a token for user: ${member.username} (ID: ${member.user_id}). Token: ${tokenObj.token}`, err);
					}
				}
			});

			// 4. Execute the migration for all members.
			for (const member of membersToMigrate) {
				migrateUserTokens(member);
			}

			console.log('-----------------------------------------');
			console.log('Refresh token data migration finished.');
			console.log(`Successfully migrated ${migratedTokenCount} tokens.`);
			if (failedUserCount > 0) {
				console.error(`Failed to parse token data for ${failedUserCount} users.`);
			}
			console.log('-----------------------------------------');
		}
	} // --- End of "else" block for data migration ---

	// --- Existing logic to drop the column (this will now run regardless of whether data migration ran, but will check again) ---
	try {
		// Re-check or use the 'legacyColumnExists' variable if you trust its state
		// For simplicity and robustness, let's re-check here.
        type ColumnInfo = { name: string; [key: string]: any; };
        const columnsAfterMigration = db.pragma('table_info(members)') as ColumnInfo[];
        const columnStillExists = columnsAfterMigration.some(col => col.name === 'refresh_tokens');

        if (columnStillExists) {
        	console.log('Attempting to drop legacy `refresh_tokens` column from `members` table...');
        	run('ALTER TABLE members DROP COLUMN refresh_tokens'); // Ensure 'run' is your db wrapper for non-query statements
        	console.log('Successfully dropped `refresh_tokens` column.');
        } else if (legacyColumnExists) {
        	// This case means the column existed, data migration happened (or was skipped due to no data),
        	// and then by the time we got here, the column was already gone (perhaps an error in DROP or it was dropped manually).
        	console.log('Legacy `refresh_tokens` column was present but is now gone. No action needed for dropping.');
        } else {
        	// Column didn't exist at the start, and still doesn't.
        	console.log('Legacy `refresh_tokens` column was not found initially. No action needed for dropping.');
        }
	} catch (e) {
		console.error('[MIGRATION_ERROR] Failed during the `refresh_tokens` column drop check/operation. This may be due to an old version of SQLite or other issues. Please manually verify if necessary.', e);
	}
	console.log('Migration script finished.');
}