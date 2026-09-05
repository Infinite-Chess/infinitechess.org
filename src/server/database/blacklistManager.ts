// src/server/database/blacklistManager.ts

/**
 * This script handles queries to the email_blacklist table: addresses we no longer send to,
 * because mail to them hard-bounced or an admin banned them.
 */

import db from './database.js';
import logEvents from '../utility/logEvents.js';

// Functions -------------------------------------------------------------------

/**
 * Adds an email to the blacklist, if it isn't already.
 * @param email - The email to blacklist. It will automatically be lowercased.
 * @throws If a database error occurs.
 */
function add(email: string, reason: string): void {
	// Uses INSERT OR IGNORE so it doesn't crash if the email is already blacklisted.
	db.call(
		() =>
			db.run(`INSERT OR IGNORE INTO email_blacklist (email, reason) VALUES (?, ?)`, [
				// Stored lowercase: emails are case-insensitive, and we never keep mixed-case ones.
				email.toLowerCase(),
				reason,
			]),
		`Database error when blacklisting email ${email}`,
	);
	logEvents.add(
		`Added ${logEvents.escapeUntrusted(email)} to blacklist for reason: ${reason}`,
		'blacklistLog',
	);
}

/**
 * Removes an email from the blacklist, if it exists.
 * @param email - The email to remove from the blacklist. Case-insensitive.
 * @throws If a database error occurs.
 */
function remove(email: string): void {
	db.call(
		() => db.run(`DELETE FROM email_blacklist WHERE email = ?`, [email.toLowerCase()]), // Lowercased to match the stored (lowercase) rows.
		`Database error when removing email ${email} from blacklist`,
	);
	logEvents.add(`Removed ${logEvents.escapeUntrusted(email)} from blacklist`, 'blacklistLog');
}

/**
 * Checks if an email is in the blacklist.
 * Returns true if blacklisted, false otherwise.
 * @param email - The email to check. Case-insensitive.
 * @throws If a database error occurs.
 */
function isBlacklisted(email: string): boolean {
	const row = db.call(
		() =>
			// prettier-ignore
			db.get<{ found: 0 | 1 }>(
				`SELECT EXISTS(SELECT 1 FROM email_blacklist WHERE email = ?) AS found`, [
					email.toLowerCase(), // Lowercased to match the stored (lowercase) rows
				]),
		`Database error when checking blacklist for email ${email}`,
	);
	return Boolean(row?.found);
}

// Exports ---------------------------------------------------------------------

export default { add, remove, isBlacklisted };
