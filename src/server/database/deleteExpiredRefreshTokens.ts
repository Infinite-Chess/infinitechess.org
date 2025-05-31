
/**
 * This module periodically checks for expired refresh tokens in the database
 * and removes them from the members' records.
 */

// @ts-ignore
import { intervalForRefreshTokenCleanupMillis } from '../config/config.js';
import db from './database.js';
import { logEventsAndPrint } from '../middleware/logEvents.js';
import { removeExpiredTokens } from '../controllers/authenticationTokens/refreshTokenObject.js';


type MemberWithRefreshTokens = {
	user_id: number;
	username: string;
	refresh_tokens: string; // JSON string of refresh tokens
};


/** Cleans up expired refresh tokens for all members. */
function cleanUpExpiredRefreshTokens() {
	try {
		console.log("Checking for expired refresh tokens.");
		
		// Query to get all members with refresh tokens
		const query = `SELECT user_id, username, refresh_tokens FROM members WHERE refresh_tokens IS NOT NULL`;
		const members = db.all<MemberWithRefreshTokens>(query);

		for (const member of members) {
			// Clean up this member's refresh tokens
			const { user_id, username, refresh_tokens } = member;

			// Parse the refresh tokens JSON
			let tokensArray = [];
			try {
				tokensArray = JSON.parse(refresh_tokens);
			} catch (error: unknown) {
				// Log the error and continue to the next member
				const errorMessage = error instanceof Error ? error.message : 'Unknown error';
				logEventsAndPrint(`Error parsing refresh tokens for member "${username}" of id "${user_id}" when checking for expired refresh tokens: ${errorMessage}`, 'errLog.txt');
				continue;
			}

			// Remove expired tokens
			const updatedTokens = removeExpiredTokens(tokensArray);

			// If there are changes, update the database
			if (updatedTokens.length !== tokensArray.length) {
				const updateQuery = `UPDATE members SET refresh_tokens = ? WHERE user_id = ?`;
				const newValue = updatedTokens.length === 0 ? null : JSON.stringify(updatedTokens);
				db.run(updateQuery, [newValue, user_id]);

				logEventsAndPrint(`Deleted atleast one expired token from member "${username}" of id "${user_id}".`, 'tokenCleanupLog.txt');
			}
		}
	} catch (error: unknown) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		logEventsAndPrint(`Error cleaning up expired refresh tokens: ${errorMessage}`, 'errLog.txt');
		return;
	}
	// console.log("Finished cleaning up refresh tokens!");
}

/** Starts the periodic cleanup of expired refresh tokens. */
function startPeriodicRefreshTokenCleanup() {
	cleanUpExpiredRefreshTokens();
	setInterval(cleanUpExpiredRefreshTokens, intervalForRefreshTokenCleanupMillis);
}

export {
	startPeriodicRefreshTokenCleanup,
};
