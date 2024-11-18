


import timeutil from '../../client/scripts/esm/util/timeutil.js';
import { intervalForRemovalOfOldUnverifiedAccountsMillis, maxExistenceTimeForUnverifiedAccountMillis } from '../config/config.js';
import db from '../database/database.js';
import { logEvents } from '../middleware/logEvents.js';
import { doStuffOnLogout } from './controllers/logoutController.js';
import { deleteUser } from './memberManager.js';

// Automatic deletion of old, unverified accounts...


const millisecondsInADay = 1000 * 60 * 60 * 24;

/**
 * Removes unverified members who have not verified their account for more than 3 days.
 */
function removeOldUnverifiedMembers() {
	try {
		console.log("Checking for old unverified accounts.");
		const now = Date.now();

		// Query to get all unverified accounts (where verification is not null)
		const notNullVerificationMembersQuery = `SELECT user_id, username, joined, login_count, verification FROM members WHERE verification IS NOT NULL`;
		const notNullVerificationMembers = db.all(notNullVerificationMembersQuery);

		const reason_deleted = "unverified";

		// Iterate through the unverified members
		for (const memberRow of notNullVerificationMembers) {
			// eslint-disable-next-line prefer-const
			let { user_id, username, joined, login_count, verification } = memberRow;
			verification = JSON.parse(verification);
			if (verification.verified) continue; // This guy is verified, just not notified.

			const timeSinceJoined = now - timeutil.isoToTimestamp(joined); // Milliseconds
			console.log(now, timeutil.isoToTimestamp(joined), joined, timeSinceJoined)

			// If the account has been unverified for longer than the threshold, delete it
			if (timeSinceJoined > maxExistenceTimeForUnverifiedAccountMillis) {
				deleteUser(user_id, username, joined, login_count, reason_deleted);
				// Close their sockets, delete their invites, delete their session cookies
				doStuffOnLogout(undefined, user_id, username);
				logEvents(`Removed unverified account "${username}" of id "${user_id}" for being unverified more than ${maxExistenceTimeForUnverifiedAccountMillis / millisecondsInADay} days.`, 'deletedAccounts.txt', { print: true });
			}
		}
		// console.log("Done!");
	} catch (error) {
		// Log any error that occurs during the process
		logEvents(`Error removing old unverified accounts: ${error.stack}`, 'errLog.txt', { print: true });
	}
}


function startPeriodicDeleteUnverifiedMembers() {
	removeOldUnverifiedMembers();
	setInterval(removeOldUnverifiedMembers, intervalForRemovalOfOldUnverifiedAccountsMillis); // Repeatedly call once a day
}


export {
	startPeriodicDeleteUnverifiedMembers,
};