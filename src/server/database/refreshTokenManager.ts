// src/server/database/refreshTokenManager.ts

/**
 * This module manages refresh tokens in the database, providing functions
 * to add, find, delete, and update them in the `refresh_tokens` table,
 * and to validate a presented refresh token against it.
 */

import type { Request } from 'express';
import type { TokenPayload } from '../utility/tokenSigner.js';

import db from './database.js';
import ip from '../utility/ip.js';
import tokenSigner from '../utility/tokenSigner.js';
import memberManager from './memberManager.js';

// Types -----------------------------------------------------------------------

/**
 * Represents a record in the `refresh_tokens` database table.
 */
export type RefreshTokenRecord = {
	token: string;
	user_id: number;
	/** The Unix timestamp, in milliseconds, when the token was created. */
	created_at: number;
	/** The Unix timestamp, in milliseconds, when the token will expire. */
	expires_at: number;
	/** The last known IP address the user used this refresh token from. */
	ip_address: string | null;
	/**
	 * The Unix timestamp, in milliseconds, when the token was consumed for a session renewal.
	 * Allow a small grace period for using old tokens when renewing sessions.
	 */
	consumed_at: number | null;
	/** 1 if this is a persistent ("keep me logged in") session. */
	is_persistent: 0 | 1;
};

// Constants -------------------------------------------------------------------

/**
 * The window where a "consumed" token is still accepted, allowing a
 * short grace period for concurrent requests during session renewal.
 */
const GRACE_PERIOD_MS = 1000 * 10; // 10 seconds

// Finding ---------------------------------------------------------------------

/**
 * Finds a refresh token in the database.
 * @param token - The JWT refresh token string.
 * @returns The token record if found, otherwise undefined.
 * @throws If a database error occurs.
 */
function find(token: string): RefreshTokenRecord | undefined {
	const query = `
        SELECT token, user_id, created_at, expires_at, is_persistent, consumed_at, ip_address
        FROM refresh_tokens
        WHERE token = ?
    `;
	return db.call(
		() => db.get<RefreshTokenRecord>(query, [token]),
		'Database error while finding refresh token',
	);
}

/**
 * Finds refresh token entries in the database associated with a list of user_ids
 * @param user_id_list - A list of user IDs
 * @returns A list of RefreshTokenRecords connected to the users in the user_id_list
 * @throws If a database error occurs.
 */
function findAllForUsers(user_id_list: number[]): RefreshTokenRecord[] {
	const placeholders = user_id_list.map(() => '?').join(', ');
	const query = `
        SELECT token, user_id, created_at, expires_at, ip_address
        FROM refresh_tokens
        WHERE user_id IN (${placeholders})
    `;
	return db.call(
		() => db.all<RefreshTokenRecord>(query, user_id_list),
		`Database error while finding refresh tokens for users ${JSON.stringify(user_id_list)}`,
	);
}

// Adding & Updating -----------------------------------------------------------

/**
 * Adds a new refresh token record to the database.
 * @param req - The Express request object to get the IP address.
 * @param userId - The ID of the user the token belongs to.
 * @param token - The new JWT refresh token string.
 * @param expiryMillis - How long, in milliseconds, until the token expires.
 * @param isPersistent - Whether this is a persistent ("keep me logged in") session.
 * @throws If a database error occurs.
 */
function add(
	req: Request,
	userId: number,
	token: string,
	expiryMillis: number,
	isPersistent: boolean,
): void {
	const now = Date.now();
	const query = `
        INSERT INTO refresh_tokens (token, user_id, created_at, expires_at, is_persistent, ip_address)
        VALUES (?, ?, ?, ?, ?, ?)
	`;
	const ip_address = ip.get(req) || null;
	db.call(
		() =>
			db.run(query, [
				token,
				userId,
				now,
				now + expiryMillis,
				isPersistent ? 1 : 0,
				ip_address,
			]),
		`Database error while adding refresh token for userId ${userId}`,
	);
}

/**
 * Updates the IP address for a given token.
 * @param token - The token to update.
 * @param ip - The new IP address to record.
 * @throws If a database error occurs.
 */
function updateIP(token: string, ip: string | null): void {
	const query = `UPDATE refresh_tokens SET ip_address = ? WHERE token = ?`;
	db.call(() => db.run(query, [ip, token]), 'Database error while updating refresh token IP');
}

/**
 * Marks a token as consumed (soft delete).
 * Used during rotation to allow a short grace period for concurrent requests.
 * @param token - The token to mark as consumed.
 * @throws If a database error occurs.
 */
function markConsumed(token: string): void {
	const now = Date.now();
	const query = `UPDATE refresh_tokens SET consumed_at = ? WHERE token = ?`;
	db.call(
		() => db.run(query, [now, token]),
		'Database error while marking refresh token as consumed',
	);
}

// Deleting --------------------------------------------------------------------

/**
 * Deletes a specific refresh token from the database.
 * No-ops if the token doesn't exist.
 * @param token - The token to delete.
 * @throws If a database error occurs.
 */
function remove(token: string): void {
	const query = `DELETE FROM refresh_tokens WHERE token = ?`;
	db.call(() => db.run(query, [token]), 'Database error while deleting refresh token');
}

/**
 * Deletes all refresh tokens for a given user. Used for "log out of all devices".
 * Effectively terminates all login sessions for the user.
 * @param userId - The user's ID.
 * @throws If a database error occurs.
 */
function removeAllForUser(userId: number): void {
	const query = `DELETE FROM refresh_tokens WHERE user_id = ?`;
	db.call(
		() => db.run(query, [userId]),
		`Database error while deleting all refresh tokens for userId ${userId}`,
	);
}

// Validating presented tokens -------------------------------------------------

/**
 * Checks if a presented refresh token is valid: not expired, nor tampered, and it's
 * still in the database (not manually invalidated by logging out, or deleting the account).
 * As side effects, deletes dead tokens found, updates the stored IP if it changed,
 * and updates the member's last_seen.
 * @param IP - Has a chance to not be defined on HTTP requests.
 */
function validate(
	token: string,
	IP?: string,
): { payload: TokenPayload; tokenRecord: RefreshTokenRecord } | undefined {
	// Decode the token
	const payload = tokenSigner.verify(token);
	if (!payload) return undefined; // Expired or tampered

	let tokenRecord: RefreshTokenRecord | undefined;
	try {
		// Check against the database
		tokenRecord = resolveValidTokenRecord(token, IP);
		if (!tokenRecord) return undefined; // Not in the database (logged out, account deleted, or rotated past its grace period)
	} catch {
		// DB error (already logged)
		return undefined;
	}

	try {
		memberManager.updateLastSeen(payload.user_id);
	} catch {
		// DB error (already logged). Token is still valid
	}
	return { payload, tokenRecord };
}

/**
 * Checks if a specific refresh token is present in the database, and has not expired,
 * deleting it if it has expired, and updating its last used IP address if it has changed.
 * If not present, it means it has either expired, been manually invalidated by the user logging out, or deleting their account.
 *
 * Returns the token record if found and valid, otherwise undefined.
 * @throws If any database error occurs during the process.
 */
function resolveValidTokenRecord(token: string, IP?: string): RefreshTokenRecord | undefined {
	// Find the token in the database.
	const tokenRecord = find(token);

	if (!tokenRecord) return; // Token must have been manually invalidated by the user logging out, or deleting their account.

	const now = Date.now();

	// Check if it is naturally expired.
	if (tokenRecord.expires_at < now) {
		// The token is expired, remove it from the database for cleanup.
		remove(token);
		return;
	}

	// Check if it was consumed (replaced) and the grace period has ended.
	if (tokenRecord.consumed_at !== null && now - tokenRecord.consumed_at > GRACE_PERIOD_MS) {
		// The token is "dead" (grace period over). Remove it from the database.
		remove(token);
		return;
	}

	// Update the IP address if it has changed.
	const IP_New: string | null = IP || null;
	if (IP_New !== tokenRecord.ip_address) {
		updateIP(token, IP_New);
	}

	return tokenRecord;
}

// Exports ---------------------------------------------------------------------

export default {
	// Constants
	GRACE_PERIOD_MS,
	// Finding
	find,
	findAllForUsers,
	// Adding & Updating
	add,
	updateIP,
	markConsumed,
	// Deleting
	remove,
	removeAllForUser,
	// Validating presented tokens
	validate,
};
