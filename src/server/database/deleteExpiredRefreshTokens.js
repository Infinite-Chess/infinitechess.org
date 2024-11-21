import db from './database.js';
import { logEvents } from '../middleware/logEvents.js';
import { intervalForRefreshTokenCleanupMillis } from '../config/config.js';
import { removeExpiredTokens } from '../controllers/authenticationTokens/refreshTokenObject.js';

/**
 * Cleans up expired refresh tokens for all members.
 */
function cleanUpExpiredRefreshTokens() {
	try {
		console.log("Checking for expired refresh tokens.");
		
		// Query to get all members with refresh tokens
		const query = `SELECT user_id, username, refresh_tokens FROM members WHERE refresh_tokens IS NOT NULL`;
		const members = db.all(query);

		for (const member of members) {
			const { user_id, username, refresh_tokens } = member;

			// Parse the refresh tokens JSON
			let tokensArray = [];
			try {
				tokensArray = JSON.parse(refresh_tokens);
			} catch (error) {
				logEvents(`Error parsing refresh tokens for member "${username}" of id "${user_id}" when checking for expired refresh tokens: ${error.message}`, 'errLog.txt', { print: true });
				continue;
			}

			// Remove expired tokens
			const updatedTokens = removeExpiredTokens(tokensArray);

			// If there are changes, update the database
			if (updatedTokens.length !== tokensArray.length) {
				const updateQuery = `UPDATE members SET refresh_tokens = ? WHERE user_id = ?`;
				db.run(updateQuery, [JSON.stringify(updatedTokens), user_id]);

				logEvents(`Deleted atleast one expired token from member "${username}" of id "${user_id}".`, 'tokenCleanupLog.txt', { print: true });
			}
		}
	} catch (error) {
		logEvents(`Error cleaning up expired refresh tokens: ${error.stack}`, 'errLog.txt', { print: true });
		return;
	}
	console.log("Finished cleaning up refresh tokens!");
}

/**
 * Starts the periodic cleanup of expired refresh tokens.
 */
function startPeriodicRefreshTokenCleanup() {
	cleanUpExpiredRefreshTokens();
	setInterval(cleanUpExpiredRefreshTokens, intervalForRefreshTokenCleanupMillis);
}

export {
	startPeriodicRefreshTokenCleanup,
};
