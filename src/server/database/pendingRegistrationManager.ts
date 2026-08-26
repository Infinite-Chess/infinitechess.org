// src/server/database/pendingRegistrationManager.ts

/**
 * This module manages the `pending_registrations` table, the staging
 * area for registration. A pending row holds a would-be account (username,
 * email, hashed password) until the user verifies their email, at which point
 * a real `members` row is created and the pending row is marked verified.
 */

import db from './database.js';

// Types -----------------------------------------------------------------------

/** Structure of a complete pending_registrations record. */
export interface PendingRegistrationRecord {
	/** HttpOnly cookie secret; unchanging. */
	claim_token: string;
	/**
	 * Email-link secret; rotates on an email change.
	 * Stored as plaintext (unlike the hashed password-reset token): these guard a pre-member,
	 * 24h-expiring row, so a DB-read leak isn't worth the round-trip hashing complexity here.
	 */
	verification_token: string;
	username: string;
	email: string;
	hashed_password: string;
	/** Unix timestamp (milliseconds) of creation. */
	created_at: number;
	/** Unix timestamp (milliseconds) when the row expires */
	expires_at: number;
	/** The created member's user_id once verified; NULL until then, doubling as the "verified" flag. */
	member_user_id: number | null;
}

// Constants -------------------------------------------------------------------

/**
 * How long a pending registration stays valid before it is swept, in milliseconds.
 * If changed, update register-awaiting.POLL_MAX_DURATION_MS to stay just past this,
 * AND update the "24 hours" copy in the email toml component.
 */
const EXPIRY_MS = 1000 * 60 * 60 * 24; // 1 day

// Create ----------------------------------------------------------------------

/**
 * Inserts a new pending registration.
 * @param claimToken - The httpOnly cookie secret.
 * @param verificationToken - The email-link secret.
 * @param username - The desired username.
 * @param email - The email to verify. It will automatically be lowercased.
 * @param hashedPassword - The already-hashed password.
 * @throws If a database error occurs (e.g. a constraint violation).
 */
function add(
	claimToken: string,
	verificationToken: string,
	username: string,
	email: string,
	hashedPassword: string,
): void {
	const now = Date.now();
	const expiresAt = now + EXPIRY_MS;
	const query = `
		INSERT INTO pending_registrations (
			claim_token, verification_token, username, email, hashed_password, created_at, expires_at
		) VALUES (?, ?, ?, ?, ?, ?, ?)
	`;
	db.call(
		() =>
			db.run(query, [
				claimToken,
				verificationToken,
				username,
				email.toLowerCase(), // Emails are always stored lowercase.
				hashedPassword,
				now,
				expiresAt,
			]),
		`Database error while adding pending registration for "${username}"`,
	);
}

// Lookups ---------------------------------------------------------------------

/**
 * Looks up a pending registration by its `claim_token` (the poll/resend path).
 * @param claimToken - The httpOnly cookie secret.
 * @returns The record if found, otherwise undefined.
 * @throws If a database error occurs.
 */
function getByClaimToken(claimToken: string): PendingRegistrationRecord | undefined {
	const query = `SELECT * FROM pending_registrations WHERE claim_token = ?`;
	return db.call(
		() => db.get<PendingRegistrationRecord>(query, [claimToken]),
		'Database error while finding pending registration by claim_token',
	);
}

/**
 * Looks up a pending registration by its `verification_token` (the verify path).
 * @param verificationToken - The email-link secret.
 * @returns The record if found, otherwise undefined.
 * @throws If a database error occurs.
 */
function getByVerificationToken(verificationToken: string): PendingRegistrationRecord | undefined {
	const query = `SELECT * FROM pending_registrations WHERE verification_token = ?`;
	return db.call(
		() => db.get<PendingRegistrationRecord>(query, [verificationToken]),
		'Database error while finding pending registration by verification_token',
	);
}

// Availability checks (non-expired rows only) ---------------------------------

/**
 * Checks whether a username is held by a non-expired pending registration
 * (case-insensitive, matching the table's COLLATE NOCASE constraint).
 * @param username - The username to check.
 * @returns True if a non-expired pending row holds this username.
 * @throws If a database error occurs.
 */
function isUsernameTaken(username: string): boolean {
	const query = `
		SELECT EXISTS(
			SELECT 1 FROM pending_registrations
			WHERE username = ? AND expires_at > ?
		) AS found
	`;
	const row = db.call(
		() => db.get<{ found: 0 | 1 }>(query, [username, Date.now()]),
		`Database error while checking pending username "${username}"`,
	);
	return Boolean(row?.found);
}

/**
 * Checks whether an email is held by a non-expired pending registration.
 * @param email - The email to check. Case-insensitive.
 * @returns True if a non-expired pending row holds this email.
 * @throws If a database error occurs.
 */
function isEmailTaken(email: string): boolean {
	const query = `
		SELECT EXISTS(
			SELECT 1 FROM pending_registrations
			WHERE email = ? AND expires_at > ?
		) AS found
	`;
	const row = db.call(
		() => db.get<{ found: 0 | 1 }>(query, [email.toLowerCase(), Date.now()]), // Lowercased to match the stored (lowercase) rows
		`Database error while checking pending email "${email}"`,
	);
	return Boolean(row?.found);
}

/**
 * Checks whether an email is held by a non-expired pending registration
 * whose `claim_token` is NOT `excludeClaimToken`. Used to distinguish a
 * re-submitter's own row from a genuine third-party collision.
 * @param email - The email to check. Case-insensitive.
 * @param excludeClaimToken - The claim_token of the row to exclude.
 * @returns True if another non-expired pending row holds this email.
 * @throws If a database error occurs.
 */
function isEmailTakenByOther(email: string, excludeClaimToken: string): boolean {
	const query = `
		SELECT EXISTS(
			SELECT 1 FROM pending_registrations
			WHERE email = ? AND expires_at > ? AND claim_token != ?
		) AS found
	`;
	const row = db.call(
		() => db.get<{ found: 0 | 1 }>(query, [email.toLowerCase(), Date.now(), excludeClaimToken]), // Lowercased to match the stored (lowercase) rows
		`Database error while checking pending email (by other) "${email}"`,
	);
	return Boolean(row?.found);
}

// Update ----------------------------------------------------------------------

/**
 * Changes the email of a pending registration (identified by its claim_token), rotates its
 * verification_token, and refreshes expires_at.
 * Call {@link deleteExpiredPendingRegistrationsFor} first so any expired row holding the new
 * email doesn't violate the UNIQUE constraint.
 * @param claimToken - The claim_token identifying the row to update.
 * @param email - The new email. It will automatically be lowercased.
 * @param verificationToken - A freshly generated verification token.
 * @throws If a database error occurs.
 */
function updateEmail(claimToken: string, email: string, verificationToken: string): void {
	const expiresAt = Date.now() + EXPIRY_MS;
	const query = `
		UPDATE pending_registrations
		SET email = ?, verification_token = ?, expires_at = ?
		WHERE claim_token = ?
	`;
	db.call(
		() => db.run(query, [email.toLowerCase(), verificationToken, expiresAt, claimToken]), // Emails are always stored lowercase.
		'Database error while updating pending registration email',
	);
}

/**
 * Marks a pending registration verified by recording the `user_id` of the member
 * row created for it. The non-NULL `member_user_id` doubles as the "verified" flag.
 * @param claimToken - The claim_token identifying the pending row.
 * @param memberUserId - The user_id of the newly created member.
 * @throws If a database error occurs, or if no pending row matches the claim_token.
 */
function markVerified(claimToken: string, memberUserId: number): void {
	const query = `UPDATE pending_registrations SET member_user_id = ? WHERE claim_token = ?`;
	db.call(() => {
		const result = db.run(query, [memberUserId, claimToken]);
		// If no rows changed, no pending row matches the claim_token.
		if (result.changes === 0) throw new Error(`No pending registration found for claim_token`);
	}, 'Database error while marking pending registration verified');
}

// Deletion --------------------------------------------------------------------

/**
 * Deletes any expired pending rows holding the given username or email. Used before a fresh
 * registration attempt so a stale, expired pending row never blocks the UNIQUE constraints.
 * @param username - The username whose expired pending rows should be cleared.
 * @param email - The email whose expired pending rows should be cleared. It will automatically be lowercased.
 * @throws If a database error occurs.
 */
function removeExpiredFor(username: string, email: string): void {
	const query = `
		DELETE FROM pending_registrations
		WHERE (username = ? OR email = ?) AND expires_at <= ?
	`;
	db.call(
		() => db.run(query, [username, email.toLowerCase(), Date.now()]), // Lowercased to match the stored (lowercase) rows
		`Database error while deleting expired pending registrations for "${username}"`,
	);
}

/**
 * Cleanup: deletes every pending registration whose `expires_at` is in the past.
 * @throws If a database error occurs.
 */
function removeExpired(): void {
	const query = `DELETE FROM pending_registrations WHERE expires_at <= ?`;
	db.call(
		() => db.run(query, [Date.now()]),
		'Database error while sweeping expired pending registrations',
	);
}

// Exports ---------------------------------------------------------------------

export default {
	// Constants
	EXPIRY_MS,
	// Create
	add,
	// Lookups
	getByClaimToken,
	getByVerificationToken,
	// Availability checks (non-expired rows only)
	isUsernameTaken,
	isEmailTaken,
	isEmailTakenByOther,
	// Update
	updateEmail,
	markVerified,
	// Deletion
	removeExpiredFor,
	removeExpired,
};
