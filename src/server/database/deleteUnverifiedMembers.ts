
/**
 * This module periodically checks for unverified accounts in the database
 * and removes them if they have been unverified for more than the configured time.
 * 
 * FUTURE: If the user has zero game records in the database, we could skip adding
 * their user_id to the deleted_members table, allowing us to reuse that id.
 */


// @ts-ignore
import { deleteAccount } from '../controllers/deleteAccountController.js';
import db from './database.js';
import { logEventsAndPrint } from '../middleware/logEvents.js';

// @ts-ignore
import { intervalForRemovalOfOldUnverifiedAccountsMillis, maxExistenceTimeForUnverifiedAccountMillis } from '../config/config.js';
import timeutil from '../../client/scripts/esm/util/timeutil.js';


import type { Verification } from '../controllers/verifyAccountController.js';


type MemberRow = {
	user_id: number;
	joined: string; // SQLite timestamp
	verification: string; // JSON string of verification data
}


/**
 * Removes unverified members who have not verified their account for more than 3 days.
 */
function removeOldUnverifiedMembers() {
	try {
		console.log("Checking for old unverified accounts.");
		const now = Date.now();

		// Query to get all unverified accounts (where verification is not null)
		const notNullVerificationMembersQuery = `SELECT user_id, joined, verification FROM members WHERE verification IS NOT NULL`;
		const notNullVerificationMembers = db.all<MemberRow>(notNullVerificationMembersQuery);

		const reason_deleted = "unverified";

		// Iterate through the unverified members
		for (const memberRow of notNullVerificationMembers) {
			// eslint-disable-next-line prefer-const
			let { user_id, joined, verification } = memberRow;
			const verificationObj = JSON.parse(verification) as Verification;
			if (verificationObj.verified) continue; // This guy is verified, just not notified.

			const timeSinceJoined = now - timeutil.sqliteToTimestamp(joined); // Milliseconds

			// If the account has been unverified for longer than the threshold, delete it
			if (timeSinceJoined > maxExistenceTimeForUnverifiedAccountMillis) {
				// Delete the account.
				const result = deleteAccount(user_id, reason_deleted); // { success, result (if failed) }
				const DAY_MILLIS = 1000 * 60 * 60 * 24;
				if (result.success) {
					logEventsAndPrint(`Removed unverified account of id "${user_id}" for being unverified more than ${maxExistenceTimeForUnverifiedAccountMillis / DAY_MILLIS} days.`, 'deletedAccounts.txt');
				} else { // Failure, either invalid delete reason, or they do not exist.
					logEventsAndPrint(`FAILED to remove unverified account of id "${user_id}" for being unverified more than ${maxExistenceTimeForUnverifiedAccountMillis / DAY_MILLIS} days!!! Reason: ${result.reason}`, 'errorLog.txt');
				}
			}
		}
		// console.log("Done!");
	} catch (error: unknown) {
		// Log any error that occurs during the process
		const errorMessage = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(`Error removing old unverified accounts: ${errorMessage}`, 'errLog.txt');
	}
}


function startPeriodicDeleteUnverifiedMembers() {
	removeOldUnverifiedMembers();
	setInterval(removeOldUnverifiedMembers, intervalForRemovalOfOldUnverifiedAccountsMillis); // Repeatedly call once a day
}


export {
	startPeriodicDeleteUnverifiedMembers,
};