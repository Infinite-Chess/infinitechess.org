// src/server/database/cleanupTasks.ts

/**
 * This script contains methods for periodically
 * cleaning up each table in the database of stale data.
 */

import db from './database.js';
import logEvents from '../utility/logEvents.js';
import emailService from '../utility/emailService.js';
import refreshTokenManager from './refreshTokenManager.js';
import pendingRegistrationManager from './pendingRegistrationManager.js';
import passwordResetTokensManager from './passwordResetTokensManager.js';

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
	deleteExpiredRefreshTokens();
	deleteExpiredPendingRegistrations();
}

// Individual cleanups ---------------------------------------------------------

/**
 * Checks the integrity of the SQLite database, and emails Naviary every problem SQLite reports.
 * Every line is needed to judge whether only indexes are damaged (`REINDEX` repairs those),
 * or table pages too (restore a backup).
 */
function checkDatabaseIntegrity(): void {
	try {
		const rows = db.call(
			() => db.all<{ integrity_check: string }>('PRAGMA integrity_check;'),
			'Error performing database integrity check',
		);
		const problems = rows.map((row) => row.integrity_check);
		if (problems.length === 1 && problems[0] === 'ok') return;

		const message = `Database integrity check failed:\n${problems.join('\n')}`;
		logEvents.addAndPrint(message, 'errLog');
		void emailService.sendAlertToSelf('database-alert', {
			title: 'Database integrity check failed',
			sections: [
				{ heading: 'PROBLEMS', kind: 'mono', lines: problems.map((text) => ({ text })) },
			],
		});
	} catch {
		// Already logged to errLog, and emailed if a storage failure. Swallowed so the remaining sweeps still run.
	}
}

/** Periodically deletes expired password reset tokens from the database. */
function deleteExpiredPasswordResetTokens(): void {
	try {
		const deleted = passwordResetTokensManager.removeExpired();

		if (deleted > 0)
			logEvents.addAndPrint(
				`Cleanup: Deleted ${deleted} expired password reset tokens.`,
				'cleanupLog',
			);
	} catch {
		// Already logged to errLog by the manager. Swallowed so the remaining sweeps still run.
	}
}

/**
 * Deletes invalid refresh tokens:
 * 1. Tokens that have naturally expired.
 * 2. Tokens that were consumed (replaced) more than a short grace period ago.
 */
function deleteExpiredRefreshTokens(): void {
	try {
		const deleted = refreshTokenManager.removeExpired();

		if (deleted > 0)
			logEvents.addAndPrint(
				`Cleanup: Deleted ${deleted} expired/consumed refresh tokens.`,
				'cleanupLog',
			);
	} catch {
		// Already logged to errLog by the manager. Swallowed so the remaining sweeps still run.
	}
}

/** Periodically deletes pending registrations that were never verified in time. */
function deleteExpiredPendingRegistrations(): void {
	try {
		const deleted = pendingRegistrationManager.removeExpired();

		if (deleted > 0)
			logEvents.addAndPrint(
				`Cleanup: Deleted ${deleted} expired pending registrations.`,
				'cleanupLog',
			);
	} catch {
		// Already logged to errLog by the manager. Swallowed so the remaining sweeps still run.
	}
}

// Exports ---------------------------------------------------------------------

export default { startPeriodic };
