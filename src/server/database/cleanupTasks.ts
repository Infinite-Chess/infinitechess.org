// src/server/database/cleanupTasks.ts

/**
 * This script contains methods for periodically
 * cleaning up each table in the database of stale data.
 */

import jsutil from '../../shared/util/jsutil.js';

import db from './database.js';
import logEvents from '../utility/logEvents.js';
import refreshTokenManager from './refreshTokenManager.js';
import pendingRegistrationManager from './pendingRegistrationManager.js';

// Constants -------------------------------------------------------------------

const CLEANUP_INTERVAL_MS = 1000 * 60 * 60 * 24; // 24 hours

// Scheduling ------------------------------------------------------------------

/** Starts periodic cleanup tasks for the database. Runs immediately, then once a day. */
function startPeriodic(): void {
	performCleanupTasks(); // Run immediately to clean up now.
	setInterval(() => performCleanupTasks(), CLEANUP_INTERVAL_MS);
}

/** Runs every individual cleanup task, in order. */
function performCleanupTasks(): void {
	checkDatabaseIntegrity();
	deleteExpiredPasswordResetTokens();
	cleanUpExpiredRefreshTokens();
	pendingRegistrationManager.removeExpired();
}

// Individual cleanups ---------------------------------------------------------

/** Checks the integrity of the SQLite database and logs it to the error log if the check fails. */
function checkDatabaseIntegrity(): void {
	try {
		const result = db.get<{ integrity_check: string }>('PRAGMA integrity_check;');

		if (result?.integrity_check !== 'ok')
			logEvents.addAndPrint(
				`Database integrity check failed: ${result?.integrity_check} !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!`,
				'errLog',
			);
	} catch (error: unknown) {
		const errorMessage = jsutil.getErrorMessage(error);
		logEvents.addAndPrint(
			`Error performing database integrity check: ${errorMessage} !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!`,
			'errLog',
		);
	}
}

/** Periodically deletes expired password reset tokens from the database. */
function deleteExpiredPasswordResetTokens(): void {
	try {
		const now = Date.now();

		const result = db.run('DELETE FROM password_reset_tokens WHERE expires_at < ?', [now]);

		if (result.changes > 0) {
			console.log(`Cleanup: Deleted ${result.changes} expired password reset tokens.`);
		}
	} catch (error) {
		const errorMessage =
			'Failed to delete expired password reset tokens: ' + jsutil.getErrorMessage(error);
		logEvents.addAndPrint(errorMessage, 'errLog');
	}
}

/**
 * Deletes invalid refresh tokens:
 * 1. Tokens that have naturally expired.
 * 2. Tokens that were consumed (replaced) more than a short grace period ago.
 */
function cleanUpExpiredRefreshTokens(): void {
	try {
		const now = Date.now();
		const consumptionThreshold = now - refreshTokenManager.GRACE_PERIOD_MS;

		const query = `
            DELETE FROM refresh_tokens
            WHERE expires_at < ?
			   OR (consumed_at IS NOT NULL AND consumed_at < ?)
        `;

		const result = db.run(query, [now, consumptionThreshold]);

		if (result.changes > 0) {
			logEvents.addAndPrint(
				`Cleanup: Deleted ${result.changes} expired/consumed refresh tokens.`,
				'tokenCleanupLog',
			);
		}
	} catch (error) {
		const errorMessage =
			'Failed to delete expired refresh tokens: ' + jsutil.getErrorMessage(error);
		logEvents.addAndPrint(errorMessage, 'errLog');
	}
}

// Exports ---------------------------------------------------------------------

export default { startPeriodic };
