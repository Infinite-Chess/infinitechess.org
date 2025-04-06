
import db from './database.js';
import { logEvents } from '../middleware/logEvents.js';


const intervalToPerformIntegrityCheck = 24 * 60 * 60 * 1000; // Run every 24 hours.



/** Checks the integrity of the SQLite database and logs it to the error log if the check fails. */
function checkDatabaseIntegrity() {
	try {
		const result = db.get('PRAGMA integrity_check');

		if (result.integrity_check !== 'ok') logEvents(`Database integrity check failed: ${result.integrity_check} !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!`, 'errLog.txt', { print: true });
		// else console.log('Database integrity check passed.');

	} catch (error) {
		logEvents(`Error performing database integrity check: ${error.message} !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!`, 'errLog.txt', { print: true });
	}
}

/** Sets up an interval to check the database integrity once every 24 hours. */
function startPeriodicIntegrityCheck() {
	checkDatabaseIntegrity();  // Run immediately to check now.
	setInterval(checkDatabaseIntegrity, intervalToPerformIntegrityCheck); // Run every 24 hours.
}

export {
	startPeriodicIntegrityCheck,
};
