
/**
 * This script contains methods for periodically
 * cleaning up each table in the database.
 */

import db from './database'; // Adjust path
import { logEventsAndPrint } from '../middleware/logEvents';


const CLEANUP_INTERVAL_MS = 1000 * 60 * 60 * 24; // 24 hours


/** Periodically deletes expired password reset tokens from the database. */
function deleteExpiredPasswordResetTokens() {
	try {
		const nowInSeconds = Math.floor(Date.now() / 1000);
		
		const result = db.run(
			'DELETE FROM password_reset_tokens WHERE expires_at < ?',
			[nowInSeconds]
		);
		
		if (result.changes > 0) {
			console.log(`Cleanup: Deleted ${result.changes} expired password reset tokens.`);
		}
	} catch (error) {
		const errorMessage = 'Failed to delete expired password reset tokens: ' + (error instanceof Error ? error.message : String(error));
		logEventsAndPrint(errorMessage, 'errLog.txt');
	}
}

/** Starts the periodic cleanup task for expired password reset tokens. */
function startPeriodicPasswordResetTokenCleanup() {
	console.log('Starting periodic cleanup of expired password reset tokens...');
	// Run it once on startup
	deleteExpiredPasswordResetTokens();
	// Then run it periodically
	setInterval(deleteExpiredPasswordResetTokens, CLEANUP_INTERVAL_MS);
}


export { startPeriodicPasswordResetTokenCleanup };