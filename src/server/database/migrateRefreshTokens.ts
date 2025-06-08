/**
 * A one-time-use script to migrate refresh tokens from the `members.refresh_tokens`
 * JSON column to the new, normalized `refresh_tokens` table.
 */

// Import your custom database wrapper
import dbWrapper from './database.js';

// Destructure the functions and the raw db instance we need from your wrapper
const { all, db } = dbWrapper;

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
 */
export function migrateRefreshTokensToTable(): void {
	console.log('Starting refresh token migration...');

	// 1. Get all members using your wrapper's 'all' function.
	const membersToMigrate = all<MemberWithTokens>(`
        SELECT user_id, username, refresh_tokens 
        FROM members 
        WHERE refresh_tokens IS NOT NULL AND refresh_tokens != '' AND refresh_tokens != '[]'
    `);

	if (membersToMigrate.length === 0) {
		console.log('No members with legacy refresh tokens found. Migration not needed.');
		return;
	}

	console.log(`Found ${membersToMigrate.length} members with tokens to migrate.`);

	// 2. Prepare the INSERT statement using the raw db instance for performance.
	const insertStmt = db.prepare(`
        INSERT INTO refresh_tokens (token, user_id, issued_at, expires_at, ip_address)
        VALUES (@token, @user_id, @issued_at, @expires_at, @ip_address)
        ON CONFLICT(token) DO NOTHING -- In case a token somehow already exists
    `);

	let migratedTokenCount = 0;
	let failedUserCount = 0;

	// 3. Use the raw db instance to create a complex transaction.
	const migrateUserTokens = db.transaction((member: MemberWithTokens) => {
		let parsedTokens: RefreshTokenObject[];
		try {
			if (!member.refresh_tokens) return;
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
                
				// CONVERT ISO STRINGS TO MILLISECOND TIMESTAMPS
				const issued_ms = new Date(tokenObj.issued).getTime();
				const expires_ms = new Date(tokenObj.expires).getTime();
                
				insertStmt.run({
					token: tokenObj.token,
					user_id: member.user_id,
					issued_at: issued_ms,    // Now an integer
					expires_at: expires_ms,  // Now an integer
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
	console.log('Refresh token migration finished.');
	console.log(`Successfully migrated ${migratedTokenCount} tokens.`);
	if (failedUserCount > 0) {
		console.error(`Failed to parse token data for ${failedUserCount} users.`);
	}
	console.log('-----------------------------------------');
}