// src/server/database/blacklistManager.ts

import db, { dbCall } from './database.js';
import { escapeLogControlChars, logEvents } from '../middleware/logEvents.js';

/**
 * Adds an email to the blacklist, if it isn't already.
 * @param email - The email to blacklist. It will automatically be lowercased.
 * @throws If a database error occurs.
 */
export function addToBlacklist(email: string, reason: string): void {
	// Uses INSERT OR IGNORE so it doesn't crash if the email is already blacklisted.
	dbCall(
		() =>
			db.run(`INSERT OR IGNORE INTO email_blacklist (email, reason) VALUES (?, ?)`, [
				// Stored lowercase: emails are case-insensitive, and we never keep mixed-case ones.
				email.toLowerCase(),
				reason,
			]),
		`Database error when blacklisting email ${email}`,
	);
	logEvents(
		`Added ${escapeLogControlChars(email)} to blacklist for reason: ${reason}`,
		'blacklistLog',
	);
}

/**
 * Removes an email from the blacklist, if it exists.
 * @param email - The email to remove from the blacklist. Case-insensitive.
 * @throws If a database error occurs.
 */
export function removeFromBlacklist(email: string): void {
	dbCall(
		() => db.run(`DELETE FROM email_blacklist WHERE email = ?`, [email.toLowerCase()]), // Lowercased to match the stored (lowercase) rows.
		`Database error when removing email ${email} from blacklist`,
	);
	logEvents(`Removed ${escapeLogControlChars(email)} from blacklist`, 'blacklistLog');
}

/**
 * Checks if an email is in the blacklist.
 * Returns true if blacklisted, false otherwise.
 * @param email - The email to check. Case-insensitive.
 * @throws If a database error occurs.
 */
export function isBlacklisted(email: string): boolean {
	const result = dbCall(
		() =>
			db.get<{ '1': number }>(`SELECT 1 FROM email_blacklist WHERE email = ?`, [
				email.toLowerCase(), // Lowercased to match the stored (lowercase) rows
			]),
		`Database error when checking blacklist for email ${email}`,
	);
	return !!result;
}
