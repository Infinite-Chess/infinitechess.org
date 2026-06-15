// src/server/database/cleanupTasks.ts

/**
 * This script contains methods for periodically
 * cleaning up each table in the database of stale data.
 */

import db from './database.js';
import { logEventsAndPrint } from '../middleware/logEvents.js';
import { refreshTokenGracePeriodMillis } from '../controllers/authenticationTokens/tokenSigner.js';
import { deleteExpiredPendingRegistrations } from './pendingRegistrationManager.js';

const CLEANUP_INTERVAL_MS = 1000 * 60 * 60 * 24; // 24 hours
// const CLEANUP_INTERVAL_MS = 1000 * 20; // 20 seconds for dev testing

function startPeriodicDatabaseCleanupTasks(): void {
	performCleanupTasks(); // Run immediately to clean up now.
	setInterval(() => performCleanupTasks(), CLEANUP_INTERVAL_MS);
}

function performCleanupTasks(): void {
	checkDatabaseIntegrity();
	deleteExpiredPasswordResetTokens();
	cleanUpExpiredRefreshTokens();
	deleteExpiredPendingRegistrations();
}

// ========================================================

/** Checks the integrity of the SQLite database and logs it to the error log if the check fails. */
function checkDatabaseIntegrity(): void {
	try {
		const result = db.get<{ integrity_check: string }>('PRAGMA integrity_check;');

		if (result?.integrity_check !== 'ok')
			logEventsAndPrint(
				`Database integrity check failed: ${result?.integrity_check} !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!`,
				'errLog',
			);
		// else console.log('Database integrity check passed.');
	} catch (error: unknown) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(
			`Error performing database integrity check: ${errorMessage} !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!`,
			'errLog',
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
		logEventsAndPrint(errorMessage, 'errLog');
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
		const consumptionThreshold = now - refreshTokenGracePeriodMillis;

		const query = `
            DELETE FROM refresh_tokens
            WHERE expires_at < ?
			   OR (consumed_at IS NOT NULL AND consumed_at < ?)
        `;

		const result = db.run(query, [now, consumptionThreshold]);

		if (result.changes > 0) {
			logEventsAndPrint(
				`Cleanup: Deleted ${result.changes} expired/consumed refresh tokens.`,
				'tokenCleanupLog.txt',
			);
		}
	} catch (error) {
		const errorMessage =
			'Failed to delete expired refresh tokens: ' +
			(error instanceof Error ? error.message : String(error));
		logEventsAndPrint(errorMessage, 'errLog');
	}
}

// =========================================================

export { startPeriodicDatabaseCleanupTasks };
