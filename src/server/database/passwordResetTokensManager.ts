// src/server/database/passwordResetTokensManager.ts

/**
 * This module manages the `password_reset_tokens` table, which holds the
 * single-use tokens emailed by the password-reset flow. Only the SHA-256 hash
 * of each token is ever stored, and a user may hold at most one live token.
 *
 * See docs/systems/PASSWORD_RESET.md.
 */

import db from './database.js';

// Types -----------------------------------------------------------------------

/** Structure of a complete password_reset_tokens record. */
interface PasswordResetTokenRecord {
	/** **Primary key.** SHA-256 hex of the emailed token; the plain token is never stored. */
	hashed_token: string;
	user_id: number;
	/** Unix timestamp (milliseconds) when the token expires. */
	expires_at: number;
	/** Unix timestamp (milliseconds) of creation, defaulted by SQLite. */
	created_at: number;
}

// Constants -------------------------------------------------------------------

/**
 * How long a password-reset token stays valid, in milliseconds.
 * IF CHANGED: update the "1 hour" copy in the email toml component.
 */
const EXPIRY_MS = 1000 * 60 * 60; // 1 Hour

// Create ----------------------------------------------------------------------

/**
 * Inserts a new password-reset token for a user.
 * Callers must clear the user's existing tokens first — `hashed_token` is the
 * primary key, so nothing here stops a user from holding several live rows.
 * @param userId - The user the token resets.
 * @param hashedToken - The SHA-256 hex of the emailed token.
 * @throws If a database error occurs.
 */
function add(userId: number, hashedToken: string): void {
	const query = `
		INSERT INTO password_reset_tokens (user_id, hashed_token, expires_at)
		VALUES (?, ?, ?)
	`;
	db.call(
		() => db.run(query, [userId, hashedToken, Date.now() + EXPIRY_MS]),
		`Database error while adding password reset token for userId ${userId}`,
	);
}

// Lookups ---------------------------------------------------------------------

/**
 * Finds the unexpired token row matching the given hash, WITHOUT consuming it.
 * @returns The row's user_id, or undefined if no live row matches.
 * @throws If a database error occurs.
 */
function findUnexpired(hashedToken: string): Pick<PasswordResetTokenRecord, 'user_id'> | undefined {
	const query = `
		SELECT user_id FROM password_reset_tokens
		WHERE hashed_token = ? AND expires_at > ?
	`;
	return db.call(
		() => db.get<Pick<PasswordResetTokenRecord, 'user_id'>>(query, [hashedToken, Date.now()]),
		'Database error while finding unexpired password reset token',
	);
}

// Deleting --------------------------------------------------------------------

/**
 * Claims the unexpired token matching the given hash: one statement both tests it and deletes
 * it. Two requests racing with the same token both run it, but only one gets a row back.
 * @returns The claimed row's user_id, or undefined if it was already consumed or has expired.
 * @throws If a database error occurs.
 */
function consume(hashedToken: string): Pick<PasswordResetTokenRecord, 'user_id'> | undefined {
	const query = `
		DELETE FROM password_reset_tokens
		WHERE hashed_token = ? AND expires_at > ?
		RETURNING user_id
	`;
	return db.call(
		() => db.get<Pick<PasswordResetTokenRecord, 'user_id'>>(query, [hashedToken, Date.now()]),
		'Database error while consuming password reset token',
	);
}

/**
 * Deletes every password-reset token belonging to a user, live or expired.
 * No-ops if they hold none.
 * @throws If a database error occurs.
 */
function removeAllForUser(userId: number): void {
	const query = `DELETE FROM password_reset_tokens WHERE user_id = ?`;
	db.call(
		() => db.run(query, [userId]),
		`Database error while deleting all password reset tokens for userId ${userId}`,
	);
}

/**
 * Cleanup: deletes every password-reset token whose `expires_at` is in the past.
 * @returns How many rows were deleted.
 * @throws If a database error occurs.
 */
function removeExpired(): number {
	const query = `DELETE FROM password_reset_tokens WHERE expires_at < ?`;
	return db.call(
		() => db.run(query, [Date.now()]).changes,
		'Database error while sweeping expired password reset tokens',
	);
}

// Exports ---------------------------------------------------------------------

export default {
	// Create
	add,
	// Lookups
	findUnexpired,
	// Deleting
	consume,
	removeAllForUser,
	removeExpired,
};
