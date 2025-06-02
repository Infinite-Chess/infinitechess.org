

/**
 * This module checks the integrity of the SQLite database at regular intervals
 * and logs any issues to the error log.
 */


import db from './database.js';
// @ts-ignore
import { logEventsAndPrint } from '../middleware/logEvents.js';


const INTEGRITY_CHECK_INTERVAL_MILLIS: number = 24 * 60 * 60 * 1000; // 24 hours


/** Checks the integrity of the SQLite database and logs it to the error log if the check fails. */
function checkDatabaseIntegrity() {
	try {
		const result = db.get<{ integrity_check: string }>('PRAGMA integrity_check;');

		if (!(result?.integrity_check === 'ok')) logEventsAndPrint(`Database integrity check failed: ${result?.integrity_check} !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!`, 'errLog.txt');
		// else console.log('Database integrity check passed.');

	} catch (error: unknown) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(`Error performing database integrity check: ${errorMessage} !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!`, 'errLog.txt');
	}
}

/** Sets up an interval to check the database integrity once every 24 hours. */
function startPeriodicDatabaseIntegrityCheck() {
	checkDatabaseIntegrity();  // Run immediately to check now.
	setInterval(checkDatabaseIntegrity, INTEGRITY_CHECK_INTERVAL_MILLIS);
}


export {
	startPeriodicDatabaseIntegrityCheck,
};
