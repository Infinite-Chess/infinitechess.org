// src/server/database/pendingRegistrationManager.ts

/**
 * This module manages the `pending_registrations` table, the staging
 * area for registration. A pending row holds a would-be account (username,
 * email, hashed password) until the user verifies their email, at which point
 * a real `members` row is created and the pending row is marked verified.
 */

import db from './database.js';
import { logEventsAndPrint } from '../middleware/logEvents.js';

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

/** How long a pending registration stays valid before it is swept, in milliseconds. */
export const PENDING_REGISTRATION_EXPIRY_MILLIS = 24 * 60 * 60 * 1000;

// Create --------------------------------------------------------------------

/**
 * Inserts a new pending registration.
 * @param claimToken - The httpOnly cookie secret.
 * @param verificationToken - The email-link secret.
 * @param username - The desired username.
 * @param email - The email to verify, in LOWERCASE.
 * @param hashedPassword - The already-hashed password.
 * @throws {Error} Throws a generic error if a database error occurs (e.g. a constraint violation).
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
	try {
		db.run(query, [
			claimToken,
			verificationToken,
			username,
			email,
			hashedPassword,
			now,
			expiresAt,
		]);
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(
			`Database error while adding pending registration for "${username}": ${message}`,
			'errLog.txt',
		);
		throw new Error('A database error occurred while processing the pending registration.');
	}
}

// Lookups -------------------------------------------------------------------

/**
 * Looks up a pending registration by its `claim_token` (the poll/resend path).
 * @param claimToken - The httpOnly cookie secret.
 * @returns The record if found, otherwise undefined.
 * @throws {Error} Throws a generic error if a database error occurs.
 */
export function getPendingRegistrationByClaimToken(
	claimToken: string,
): PendingRegistrationRecord | undefined {
	const query = `SELECT * FROM pending_registrations WHERE claim_token = ?`;
	try {
		return db.get<PendingRegistrationRecord>(query, [claimToken]);
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(
			`Database error while finding pending registration by claim_token: ${message}`,
			'errLog.txt',
		);
		throw new Error('A database error occurred while processing the pending registration.');
	}
}

/**
 * Looks up a pending registration by its `verification_token` (the verify path).
 * @param verificationToken - The email-link secret.
 * @returns The record if found, otherwise undefined.
 * @throws {Error} Throws a generic error if a database error occurs.
 */
export function getPendingRegistrationByVerificationToken(
	verificationToken: string,
): PendingRegistrationRecord | undefined {
	const query = `SELECT * FROM pending_registrations WHERE verification_token = ?`;
	try {
		return db.get<PendingRegistrationRecord>(query, [verificationToken]);
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(
			`Database error while finding pending registration by verification_token: ${message}`,
			'errLog.txt',
		);
		throw new Error('A database error occurred while processing the pending registration.');
	}
}

// Availability checks (non-expired rows only) -------------------------------

/**
 * Checks whether a username is held by a non-expired pending registration
 * (case-insensitive, matching the table's COLLATE NOCASE constraint).
 * @param username - The username to check.
 * @returns True if a non-expired pending row holds this username.
 * @throws {Error} Throws a generic error if a database error occurs.
 */
export function isUsernameTakenInPending(username: string): boolean {
	const query = `
		SELECT EXISTS(
			SELECT 1 FROM pending_registrations
			WHERE username = ? AND expires_at > ?
		) AS found
	`;
	try {
		const row = db.get<{ found: 0 | 1 }>(query, [username, Date.now()]);
		return Boolean(row?.found);
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(
			`Database error while checking pending username "${username}": ${message}`,
			'errLog.txt',
		);
		throw new Error('A database error occurred while processing the pending registration.');
	}
}

/**
 * Checks whether an email is held by a non-expired pending registration.
 * @param email - The email to check, in LOWERCASE.
 * @returns True if a non-expired pending row holds this email.
 * @throws {Error} Throws a generic error if a database error occurs.
 */
export function isEmailTakenInPending(email: string): boolean {
	const query = `
		SELECT EXISTS(
			SELECT 1 FROM pending_registrations
			WHERE email = ? AND expires_at > ?
		) AS found
	`;
	try {
		const row = db.get<{ found: 0 | 1 }>(query, [email, Date.now()]);
		return Boolean(row?.found);
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(
			`Database error while checking pending email "${email}": ${message}`,
			'errLog.txt',
		);
		throw new Error('A database error occurred while processing the pending registration.');
	}
}

// Update --------------------------------------------------------------------

/**
 * Marks a pending registration verified by recording the `user_id` of the member
 * row created for it. The non-NULL `member_user_id` doubles as the "verified" flag.
 * @param claimToken - The claim_token identifying the pending row.
 * @param memberUserId - The user_id of the newly created member.
 * @returns Whether a row was updated (false if no matching pending row exists).
 * @throws {Error} Throws a generic error if a database error occurs.
 */
export function markPendingRegistrationVerified(
	claimToken: string,
	memberUserId: number,
): { changeMade: boolean } {
	const query = `UPDATE pending_registrations SET member_user_id = ? WHERE claim_token = ?`;
	try {
		const result = db.run(query, [memberUserId, claimToken]);
		return { changeMade: result.changes > 0 };
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(
			`Database error while marking pending registration verified: ${message}`,
			'errLog.txt',
		);
		throw new Error('A database error occurred while processing the pending registration.');
	}
}

// Deletion ------------------------------------------------------------------

/**
 * Deletes any expired pending rows holding the given username or email. Used before a fresh
 * registration attempt so a stale, expired pending row never blocks the UNIQUE constraints.
 * @param username - The username whose expired pending rows should be cleared.
 * @param email - The email (LOWERCASE) whose expired pending rows should be cleared.
 * @throws {Error} Throws a generic error if a database error occurs.
 */
export function deleteExpiredPendingRegistrationsFor(username: string, email: string): void {
	const query = `
		DELETE FROM pending_registrations
		WHERE (username = ? OR email = ?) AND expires_at <= ?
	`;
	try {
		db.run(query, [username, email, Date.now()]);
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(
			`Database error while deleting expired pending registrations for "${username}": ${message}`,
			'errLog.txt',
		);
		throw new Error('A database error occurred while processing the pending registration.');
	}
}

/**
 * Cleanup: deletes every pending registration whose `expires_at` is in the past.
 * @returns The number of rows deleted.
 * @throws {Error} Throws a generic error if a database error occurs.
 */
export function deleteExpiredPendingRegistrations(): number {
	const query = `DELETE FROM pending_registrations WHERE expires_at <= ?`;
	try {
		return db.run(query, [Date.now()]).changes;
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(
			`Database error while sweeping expired pending registrations: ${message}`,
			'errLog.txt',
		);
		throw new Error('A database error occurred while processing the pending registration.');
	}
}
