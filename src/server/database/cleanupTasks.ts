
/**
 * This script contains methods for periodically
 * cleaning up each table in the database of stale data.
 */


// @ts-ignore
import { maxExistenceTimeForUnverifiedAccountMillis } from '../config/config.js';
// @ts-ignore
import { deleteAccount } from '../controllers/deleteAccountController.js';
import db from './database.js'; // Adjust path
import { logEventsAndPrint } from '../middleware/logEvents.js';
import timeutil from '../../client/scripts/esm/util/timeutil.js';


import type { Verification } from '../controllers/verifyAccountController.js';



const CLEANUP_INTERVAL_MS = 1000 * 60 * 60 * 24; // 24 hours



function startPeriodicDatabaseCleanupTasks() {
	performCleanupTasks(); // Run immediately to clean up now.
	setInterval(performCleanupTasks, CLEANUP_INTERVAL_MS);
}

function performCleanupTasks() {
	checkDatabaseIntegrity();
	deleteExpiredPasswordResetTokens();
	cleanUpExpiredRefreshTokens();
}


// ========================================================


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
				const errorMessage = error instanceof Error ? error.message : String(error);
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
		const errorMessage = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(`Error cleaning up expired refresh tokens: ${errorMessage}`, 'errLog.txt');
		return;
	}
	// console.log("Finished cleaning up refresh tokens!");
}


type MemberRow = {
	user_id: number;
	joined: string; // SQLite timestamp
	verification: string; // JSON string of verification data
}

/**
 * Removes unverified members who have not verified their account for more than 3 days.
 * 
 * FUTURE: If the user has zero game records in the database, we could skip adding
 * their user_id to the deleted_members table, allowing us to reuse that id.
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


// =========================================================


export {
	startPeriodicDatabaseCleanupTasks
};