// src/server/database/refreshTokenManager.ts

/**
 * This module manages refresh tokens in the database, providing functions
 * to add, find, delete, and update them in the `refresh_tokens` table.
 */

import timeutil from '../../shared/util/timeutil.js';

import db from './database.js';

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
const GRACE_PERIOD_MS = timeutil.toMillis(10, 'seconds');

// Finding ---------------------------------------------------------------------

/**
 * Finds a refresh token in the database, unless it was consumed past its grace period.
 * @param token - The JWT refresh token string.
 * @returns The token record if found, otherwise undefined.
 * @throws If a database error occurs.
 */
function findLive(token: string): RefreshTokenRecord | undefined {
	const query = `
        SELECT token, user_id, created_at, expires_at, is_persistent, consumed_at, ip_address
        FROM refresh_tokens
        WHERE token = ?
          AND (consumed_at IS NULL OR consumed_at >= ?)
    `;
	return db.call(
		() => db.get<RefreshTokenRecord>(query, [token, Date.now() - GRACE_PERIOD_MS]),
		'Database error while finding refresh token',
	);
}

/**
 * Finds the IP address of every refresh token belonging to the given users.
 * @param user_id_list - A list of user IDs
 * @returns One entry per refresh token, pairing its user with its last known IP address.
 * @throws If a database error occurs.
 */
function findIPsForUsers(
	user_id_list: number[],
): Pick<RefreshTokenRecord, 'user_id' | 'ip_address'>[] {
	const placeholders = user_id_list.map(() => '?').join(', ');
	const query = `
        SELECT user_id, ip_address
        FROM refresh_tokens
        WHERE user_id IN (${placeholders})
    `;
	return db.call(
		() => db.all<Pick<RefreshTokenRecord, 'user_id' | 'ip_address'>>(query, user_id_list),
		`Database error while finding refresh tokens for users ${JSON.stringify(user_id_list)}`,
	);
}

// Adding & Updating -----------------------------------------------------------

/**
 * Adds a new refresh token record to the database.
 * @param userId - The ID of the user the token belongs to.
 * @param token - The new JWT refresh token string.
 * @param expiryMillis - How long, in milliseconds, until the token expires.
 * @param isPersistent - Whether this is a persistent ("keep me logged in") session.
 * @param ip - The IP address the token was issued to, if known.
 * @throws If a database error occurs.
 */
function add(
	userId: number,
	token: string,
	expiryMillis: number,
	isPersistent: boolean,
	ip: string | undefined,
): void {
	const now = Date.now();
	const query = `
        INSERT INTO refresh_tokens (token, user_id, created_at, expires_at, is_persistent, ip_address)
        VALUES (?, ?, ?, ?, ?, ?)
	`;
	const ip_address = ip || null;
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

/**
 * Cleanup: deletes every refresh token that has naturally expired, plus every
 * consumed one whose grace period has elapsed.
 * @returns How many rows were deleted.
 * @throws If a database error occurs.
 */
function removeExpired(): number {
	const query = `
		DELETE FROM refresh_tokens
		WHERE expires_at < ?
		   OR (consumed_at IS NOT NULL AND consumed_at < ?)
	`;
	const now = Date.now();
	return db.call(
		() => db.run(query, [now, now - GRACE_PERIOD_MS]).changes,
		'Database error while sweeping expired refresh tokens',
	);
}

// Exports ---------------------------------------------------------------------

export default {
	// Finding
	findLive,
	findIPsForUsers,
	// Adding & Updating
	add,
	updateIP,
	markConsumed,
	// Deleting
	remove,
	removeAllForUser,
	removeExpired,
};
