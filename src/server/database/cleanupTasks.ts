// src/server/database/cleanupTasks.ts

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
import timeutil from '../../shared/util/timeutil.js';

const CLEANUP_INTERVAL_MS = 1000 * 60 * 60 * 24; // 24 hours
// const CLEANUP_INTERVAL_MS = 1000 * 20; // 20 seconds for dev testing

function startPeriodicDatabaseCleanupTasks(): void {
	performCleanupTasks(); // Run immediately to clean up now.
	setInterval(performCleanupTasks, CLEANUP_INTERVAL_MS);
}

function performCleanupTasks(): void {
	checkDatabaseIntegrity();
	deleteExpiredPasswordResetTokens();
	cleanUpExpiredRefreshTokens();
	removeOldUnverifiedMembers();
}

// ========================================================

/** Checks the integrity of the SQLite database and logs it to the error log if the check fails. */
function checkDatabaseIntegrity(): void {
	try {
		const result = db.get<{ integrity_check: string }>('PRAGMA integrity_check;');

		if (result?.integrity_check !== 'ok')
			logEventsAndPrint(
				`Database integrity check failed: ${result?.integrity_check} !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!`,
				'errLog.txt',
			);
		// else console.log('Database integrity check passed.');
	} catch (error: unknown) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(
			`Error performing database integrity check: ${errorMessage} !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!`,
			'errLog.txt',
		);
	}
}

/** Periodically deletes expired password reset tokens from the database. */
function deleteExpiredPasswordResetTokens(): void {
	// console.log('Running cleanup of expired password reset tokens.');
	try {
		const now = Date.now();

		const result = db.run('DELETE FROM password_reset_tokens WHERE expires_at < ?', [now]);

		if (result.changes > 0) {
			console.log(`Cleanup: Deleted ${result.changes} expired password reset tokens.`);
		}
	} catch (error) {
		const errorMessage =
			'Failed to delete expired password reset tokens: ' +
			(error instanceof Error ? error.message : String(error));
		logEventsAndPrint(errorMessage, 'errLog.txt');
	}
}

/** Deletes all expired refresh tokens from the database in a single, efficient query. */
function cleanUpExpiredRefreshTokens(): void {
	// console.log('Running cleanup of expired refresh tokens.');
	try {
		const now = Date.now();

		const result = db.run('DELETE FROM refresh_tokens WHERE expires_at < ?', [now]);

		if (result.changes > 0) {
			logEventsAndPrint(
				`Cleanup: Deleted ${result.changes} expired refresh tokens.`,
				'tokenCleanupLog.txt',
			);
		}
	} catch (error) {
		const errorMessage =
			'Failed to delete expired refresh tokens: ' +
			(error instanceof Error ? error.message : String(error));
		logEventsAndPrint(errorMessage, 'errLog.txt');
	}
}

/**
 * Removes unverified members who have not verified their account for more than 3 days.
 *
 * FUTURE: If the user has zero game records in the database, we could skip adding
 * their user_id to the deleted_members table, allowing us to reuse that id.
 */
function removeOldUnverifiedMembers(): void {
	// console.log("Checking for old unverified accounts to remove.");
	try {
		// Calculate the cutoff time.
		const cutoffTimestamp = Date.now() - maxExistenceTimeForUnverifiedAccountMillis;
		const cutoffDateString = timeutil.timestampToSqlite(cutoffTimestamp);

		const membersToDelete = db.all<{ user_id: number }>(
			`
			SELECT user_id FROM members 
			WHERE is_verified = 0 
			  AND joined < ?
		`,
			[cutoffDateString],
		);

		if (membersToDelete.length === 0) return; // Nothing to do.

		console.log(`Found ${membersToDelete.length} old unverified account(s) to remove.`);
		const reason_deleted = 'unverified';

		// Iterate through the IDs and delete each account.
		for (const member of membersToDelete) {
			try {
				deleteAccount(member.user_id, reason_deleted);
				logEventsAndPrint(
					`Removed old unverified account with ID: ${member.user_id}`,
					'deletedAccounts.txt',
				);
			} catch (error: unknown) {
				const message = error instanceof Error ? error.message : String(error);
				logEventsAndPrint(
					`FAILED to remove old unverified account with ID (${member.user_id}): ${message}`,
					'errLog.txt',
				);
			}
		}
	} catch (error: unknown) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(`Error removing old unverified accounts: ${errorMessage}`, 'errLog.txt');
	}
}

// =========================================================

export { startPeriodicDatabaseCleanupTasks };
