// src/server/database/blacklistManager.ts

import { logEventsAndPrint } from '../middleware/logEvents.js';
import db from './database.js';

/** Adds an email to the blacklist, if it isn't already. */
export function addToBlacklist(email: string, reason: string): void {
	try {
		// Uses INSERT OR IGNORE so it doesn't crash if the email is already blacklisted.
		db.run(`INSERT OR IGNORE INTO email_blacklist (email, reason) VALUES (?, ?)`, [
			email,
			reason,
		]);
		logEventsAndPrint(`Added ${email} to blacklist for reason: ${reason}`, 'blacklistLog.txt');
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		logEventsAndPrint(`Database error when blacklisting email ${email}: ${msg}`, 'errLog.txt');
	}
}

/**
 * Checks if an email is in the blacklist.
 * Returns true if blacklisted, false otherwise.
 */
export function isBlacklisted(email: string): boolean {
	try {
		// We select '1' just to see if a row exists.
		// db.get returns the row object (truthy) or undefined (falsy).
		const result = db.get<{ '1': number }>(`SELECT 1 FROM email_blacklist WHERE email = ?`, [
			email,
		]);
		return !!result;
	} catch (err: unknown) {
		const msg = err instanceof Error ? err.message : String(err);
		logEventsAndPrint(
			`Database error when checking blacklist for email ${email}: ${msg}`,
			'errLog.txt',
		);
		// Fail safe: If DB errors, assume NOT blacklisted so we don't block legitimate users
		// (or return true if we want to be ultra-safe/paranoid)
		return false;
	}
}
