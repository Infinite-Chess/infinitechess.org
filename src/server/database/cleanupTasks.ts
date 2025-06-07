
/**
 * This script contains methods for periodically
 * cleaning up each table in the database.
 */

import db from './database.js'; // Adjust path
import { logEventsAndPrint } from '../middleware/logEvents.js';


const CLEANUP_INTERVAL_MS = 1000 * 60 * 60 * 24; // 24 hours



/** Checks the integrity of the SQLite database and logs it to the error log if the check fails. */
function checkDatabaseIntegrity() {
	try {
		const result = db.get<{ integrity_check: string }>('PRAGMA integrity_check;');

		if (result?.integrity_check !== 'ok') logEventsAndPrint(`Database integrity check failed: ${result?.integrity_check} !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!`, 'errLog.txt');
		// else console.log('Database integrity check passed.');

	} catch (error: unknown) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(`Error performing database integrity check: ${errorMessage} !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!`, 'errLog.txt');
	}
}

/** Sets up an interval to check the database integrity once every 24 hours. */
function startPeriodicDatabaseIntegrityCheck() {
	checkDatabaseIntegrity();  // Run immediately to check now.
	setInterval(checkDatabaseIntegrity, CLEANUP_INTERVAL_MS);
}



/** Periodically deletes expired password reset tokens from the database. */
function deleteExpiredPasswordResetTokens() {
	console.log('Running cleanup of expired password reset tokens.');
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
	// console.log('Starting periodic cleanup of expired password reset tokens...');
	// Run it once on startup
	deleteExpiredPasswordResetTokens();
	// Then run it periodically
	setInterval(deleteExpiredPasswordResetTokens, CLEANUP_INTERVAL_MS);
}


export { startPeriodicPasswordResetTokenCleanup };