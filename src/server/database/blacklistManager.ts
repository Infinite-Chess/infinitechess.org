// src/server/database/blacklistManager.ts

import { logEvents } from '../middleware/logEvents.js';
import db, { dbCall } from './database.js';

/** Adds an email to the blacklist, if it isn't already. */
export function addToBlacklist(email: string, reason: string): void {
	// Uses INSERT OR IGNORE so it doesn't crash if the email is already blacklisted.
	dbCall(
		() =>
			db.run(`INSERT OR IGNORE INTO email_blacklist (email, reason) VALUES (?, ?)`, [
				email,
				reason,
			]),
		`Database error when blacklisting email ${email}`,
	);
	logEvents(`Added ${email} to blacklist for reason: ${reason}`, 'blacklistLog.txt');
}

/** Removes an email from the blacklist, if it exists. */
export function removeFromBlacklist(email: string): void {
	// Won't error if the email doesn't exist.
	dbCall(
		() => db.run(`DELETE FROM email_blacklist WHERE email = ?`, [email]),
		`Database error when removing email ${email} from blacklist`,
	);
	logEvents(`Removed ${email} from blacklist`, 'blacklistLog.txt');
}

/**
 * Checks if an email is in the blacklist.
 * Returns true if blacklisted, false otherwise.
 */
export function isBlacklisted(email: string): boolean {
	// We select '1' just to see if a row exists.
	// db.get returns the row object (truthy) or undefined (falsy).
	const result = dbCall(
		() => db.get<{ '1': number }>(`SELECT 1 FROM email_blacklist WHERE email = ?`, [email]),
		`Database error when checking blacklist for email ${email}`,
	);
	return !!result;
}
