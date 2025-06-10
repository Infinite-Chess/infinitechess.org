
/**
 * This module manages refresh tokens in the database, providing functions
 * to add, find, delete, and update them in the `refresh_tokens` table.
 */


import db from './database.js';
// @ts-ignore
import { getClientIP } from '../utility/IP.js';
// @ts-ignore
import { refreshTokenExpiryMillis } from '../config/config.js';


import type { Request } from 'express';



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
    ip_address: string | null;
};

/**
 * Finds a refresh token in the database.
 * @param token - The JWT refresh token string.
 * @returns The token record if found, otherwise undefined.
 */
export function findRefreshToken(token: string): RefreshTokenRecord | undefined {
	const query = `
        SELECT token, user_id, created_at, expires_at, ip_address 
        FROM refresh_tokens 
        WHERE token = ?
    `;
	return db.get<RefreshTokenRecord>(query, [token]);
}

/**
 * Adds a new refresh token record to the database.
 * @param req - The Express request object to get the IP address.
 * @param userId - The ID of the user the token belongs to.
 * @param token - The new JWT refresh token string.
 */
export function addRefreshToken(req: Request, userId: number, token: string): void {
	const now = Date.now();
	const query = `
        INSERT INTO refresh_tokens (token, user_id, created_at, expires_at, ip_address)
        VALUES (?, ?, ?, ?, ?)
    `;
	db.run(query, [
        token,
        userId,
        now, // created_at
        now + refreshTokenExpiryMillis, // expires_at
        getClientIP(req)
    ]);
}

/**
 * Deletes a specific refresh token from the database.
 * @param token - The token to delete.
 */
export function deleteRefreshToken(token: string): void {
	const query = `DELETE FROM refresh_tokens WHERE token = ?`;
	db.run(query, [token]);
}

/**
 * Deletes all refresh tokens for a given user. Used for "log out of all devices".
 * Effectively terminates all login sessions for the user.
 * @param userId - The user's ID.
 */
export function deleteAllRefreshTokensForUser(userId: number): void {
	const query = `DELETE FROM refresh_tokens WHERE user_id = ?`;
	db.run(query, [userId]);
}

/**
 * Updates the IP address for a given token.
 * @param token - The token to update.
 * @param ip - The new IP address to record.
 */
export function updateRefreshTokenIP(token: string, ip: string): void {
	const query = `UPDATE refresh_tokens SET ip_address = ? WHERE token = ?`;
	db.run(query, [ip, token]);
}