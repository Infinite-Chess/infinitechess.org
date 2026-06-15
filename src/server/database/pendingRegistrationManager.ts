// src/server/database/pendingRegistrationManager.ts

/**
 * This module manages the `pending_registrations` table, the staging
 * area for registration. A pending row holds a would-be account (username,
 * email, hashed password) until the user verifies their email, at which point
 * a real `members` row is created and the pending row is marked verified.
 */

import db, { dbCall } from './database.js';

// Types ---------------------------------------------------------------------

/** Structure of a complete pending_registrations record. */
export interface PendingRegistrationRecord {
	/** httpOnly cookie secret; unchanging. */
	claim_token: string;
	/** email-link secret; rotates on an email change. */
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

// Constants -----------------------------------------------------------------

/**
 * How long a pending registration stays valid before it is swept, in milliseconds.
 * If changed, update register-awaiting.POLL_MAX_DURATION_MS to stay just past this.
 */
export const PENDING_REGISTRATION_EXPIRY_MILLIS = 1000 * 60 * 60 * 24; // 1 day

// Create --------------------------------------------------------------------

/**
 * Inserts a new pending registration.
 * @param claimToken - The httpOnly cookie secret.
 * @param verificationToken - The email-link secret.
 * @param username - The desired username.
 * @param email - The email to verify, in LOWERCASE.
 * @param hashedPassword - The already-hashed password.
 * @throws If a database error occurs (e.g. a constraint violation).
 */
export function addPendingRegistration(
	claimToken: string,
	verificationToken: string,
	username: string,
	email: string,
	hashedPassword: string,
): void {
	const now = Date.now();
	const expiresAt = now + PENDING_REGISTRATION_EXPIRY_MILLIS;
	const query = `
		INSERT INTO pending_registrations (
			claim_token, verification_token, username, email, hashed_password, created_at, expires_at
		) VALUES (?, ?, ?, ?, ?, ?, ?)
	`;
	dbCall(
		() =>
			db.run(query, [
				claimToken,
				verificationToken,
				username,
				email,
				hashedPassword,
				now,
				expiresAt,
			]),
		`Database error while adding pending registration for "${username}"`,
	);
}

// Lookups -------------------------------------------------------------------

/**
 * Looks up a pending registration by its `claim_token` (the poll/resend path).
 * @param claimToken - The httpOnly cookie secret.
 * @returns The record if found, otherwise undefined.
 * @throws If a database error occurs.
 */
export function getPendingRegistrationByClaimToken(
	claimToken: string,
): PendingRegistrationRecord | undefined {
	const query = `SELECT * FROM pending_registrations WHERE claim_token = ?`;
	return dbCall(
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
export function getPendingRegistrationByVerificationToken(
	verificationToken: string,
): PendingRegistrationRecord | undefined {
	const query = `SELECT * FROM pending_registrations WHERE verification_token = ?`;
	return dbCall(
		() => db.get<PendingRegistrationRecord>(query, [verificationToken]),
		'Database error while finding pending registration by verification_token',
	);
}

// Availability checks (non-expired rows only) -------------------------------

/**
 * Checks whether a username is held by a non-expired pending registration
 * (case-insensitive, matching the table's COLLATE NOCASE constraint).
 * @param username - The username to check.
 * @returns True if a non-expired pending row holds this username.
 * @throws If a database error occurs.
 */
export function isUsernameTakenInPending(username: string): boolean {
	const query = `
		SELECT EXISTS(
			SELECT 1 FROM pending_registrations
			WHERE username = ? AND expires_at > ?
		) AS found
	`;
	const row = dbCall(
		() => db.get<{ found: 0 | 1 }>(query, [username, Date.now()]),
		`Database error while checking pending username "${username}"`,
	);
	return Boolean(row?.found);
}

/**
 * Checks whether an email is held by a non-expired pending registration.
 * @param email - The email to check, in LOWERCASE.
 * @returns True if a non-expired pending row holds this email.
 * @throws If a database error occurs.
 */
export function isEmailTakenInPending(email: string): boolean {
	const query = `
		SELECT EXISTS(
			SELECT 1 FROM pending_registrations
			WHERE email = ? AND expires_at > ?
		) AS found
	`;
	const row = dbCall(
		() => db.get<{ found: 0 | 1 }>(query, [email, Date.now()]),
		`Database error while checking pending email "${email}"`,
	);
	return Boolean(row?.found);
}

/**
 * Checks whether an email is held by a non-expired pending registration
 * whose `claim_token` is NOT `excludeClaimToken`. Used to distinguish a
 * re-submitter's own row from a genuine third-party collision.
 * @param email - The email to check, in LOWERCASE.
 * @param excludeClaimToken - The claim_token of the row to exclude.
 * @returns True if another non-expired pending row holds this email.
 * @throws If a database error occurs.
 */
export function isEmailTakenInPendingByOther(email: string, excludeClaimToken: string): boolean {
	const query = `
		SELECT EXISTS(
			SELECT 1 FROM pending_registrations
			WHERE email = ? AND expires_at > ? AND claim_token != ?
		) AS found
	`;
	const row = dbCall(
		() => db.get<{ found: 0 | 1 }>(query, [email, Date.now(), excludeClaimToken]),
		`Database error while checking pending email (by other) "${email}"`,
	);
	return Boolean(row?.found);
}

// Update --------------------------------------------------------------------

/**
 * Changes the email of a pending registration (identified by its claim_token), rotates its
 * verification_token, and refreshes expires_at.
 * Call {@link deleteExpiredPendingRegistrationsFor} first so any expired row holding the new
 * email doesn't violate the UNIQUE constraint.
 * @param claimToken - The claim_token identifying the row to update.
 * @param email - The new email, in LOWERCASE.
 * @param verificationToken - A freshly generated verification token.
 * @throws If a database error occurs.
 */
export function updatePendingRegistrationEmail(
	claimToken: string,
	email: string,
	verificationToken: string,
): void {
	const expiresAt = Date.now() + PENDING_REGISTRATION_EXPIRY_MILLIS;
	const query = `
		UPDATE pending_registrations
		SET email = ?, verification_token = ?, expires_at = ?
		WHERE claim_token = ?
	`;
	dbCall(
		() => db.run(query, [email, verificationToken, expiresAt, claimToken]),
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
export function markPendingRegistrationVerified(claimToken: string, memberUserId: number): void {
	const query = `UPDATE pending_registrations SET member_user_id = ? WHERE claim_token = ?`;
	dbCall(() => {
		const result = db.run(query, [memberUserId, claimToken]);
		// If no rows changed, no pending row matches the claim_token.
		if (result.changes === 0) throw new Error(`No pending registration found for claim_token`);
	}, 'Database error while marking pending registration verified');
}

// Deletion ------------------------------------------------------------------

/**
 * Deletes any expired pending rows holding the given username or email. Used before a fresh
 * registration attempt so a stale, expired pending row never blocks the UNIQUE constraints.
 * @param username - The username whose expired pending rows should be cleared.
 * @param email - The email (LOWERCASE) whose expired pending rows should be cleared.
 * @throws If a database error occurs.
 */
export function deleteExpiredPendingRegistrationsFor(username: string, email: string): void {
	const query = `
		DELETE FROM pending_registrations
		WHERE (username = ? OR email = ?) AND expires_at <= ?
	`;
	dbCall(
		() => db.run(query, [username, email, Date.now()]),
		`Database error while deleting expired pending registrations for "${username}"`,
	);
}

/**
 * Cleanup: deletes every pending registration whose `expires_at` is in the past.
 * @throws If a database error occurs.
 */
export function deleteExpiredPendingRegistrations(): void {
	const query = `DELETE FROM pending_registrations WHERE expires_at <= ?`;
	dbCall(
		() => db.run(query, [Date.now()]),
		'Database error while sweeping expired pending registrations',
	);
}
