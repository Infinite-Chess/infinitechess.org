// src/server/database/refreshTokenManager.ts

/**
 * This module manages refresh tokens in the database, providing functions
 * to add, find, delete, and update them in the `refresh_tokens` table.
 */

import db from './database.js';
import { refreshTokenExpiryMillis } from '../controllers/authenticationTokens/tokenSigner.js';
// @ts-ignore
import { getClientIP } from '../utility/IP.js';
import { logEventsAndPrint } from '../middleware/logEvents.js';

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
	/** The last known IP address the user used this refresh token from. */
	ip_address: string | null;
};

/**
 * Finds a refresh token in the database.
 * @param token - The JWT refresh token string.
 * @returns The token record if found, otherwise undefined.
 * @throws {Error} Throws a generic error if a database error occurs.
 */
export function findRefreshToken(token: string): RefreshTokenRecord | undefined {
	const query = `
        SELECT token, user_id, created_at, expires_at, ip_address 
        FROM refresh_tokens 
        WHERE token = ?
    `;
	try {
		return db.get<RefreshTokenRecord>(query, [token]);
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(`Database error while finding refresh token: ${message}`, 'errLog.txt');
		throw new Error('A database error occurred while processing the refresh token.');
	}
}

/**
 * Finds refresh token entries in the database associated with a list of user_ids
 * @param user_id_list - A list of user IDs
 * @returns A list of RefreshTokenRecords connected to the users in the user_id_list
 * @throws {Error} Throws a generic error if a database error occurs.
 */
export function findRefreshTokensForUsers(user_id_list: number[]): RefreshTokenRecord[] {
	const placeholders = user_id_list.map(() => '?').join(', ');
	const query = `
        SELECT token, user_id, created_at, expires_at, ip_address
        FROM refresh_tokens
        WHERE user_id IN (${placeholders})
    `;
	try {
		return db.all<RefreshTokenRecord>(query, user_id_list);
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(
			`Database error while finding refresh tokens for users ${JSON.stringify(user_id_list)}: ${message}`,
			'errLog.txt',
		);
		throw new Error('A database error occurred while processing the refresh token.');
	}
}

/**
 * Adds a new refresh token record to the database.
 * @param req - The Express request object to get the IP address.
 * @param userId - The ID of the user the token belongs to.
 * @param token - The new JWT refresh token string.
 * @throws {Error} Throws a generic error if a database error occurs.
 */
export function addRefreshToken(req: Request, userId: number, token: string): void {
	const now = Date.now();
	const query = `
        INSERT INTO refresh_tokens (token, user_id, created_at, expires_at, ip_address)
        VALUES (?, ?, ?, ?, ?)
	`;
	const ip_address = getClientIP(req) || null;
	try {
		db.run(query, [
			token,
			userId,
			now, // created_at
			now + refreshTokenExpiryMillis, // expires_at
			ip_address,
		]);
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(
			`Database error while adding refresh token for userId ${userId}: ${message}`,
			'errLog.txt',
		);
		throw new Error('A database error occurred while processing the refresh token.');
	}
}

/**
 * Deletes a specific refresh token from the database.
 * @param token - The token to delete.
 * @throws {Error} Throws a generic error if a database error occurs.
 */
export function deleteRefreshToken(token: string): void {
	const query = `DELETE FROM refresh_tokens WHERE token = ?`;
	try {
		db.run(query, [token]);
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(`Database error while deleting refresh token: ${message}`, 'errLog.txt');
		throw new Error('A database error occurred while processing the refresh token.');
	}
}

/**
 * Deletes all refresh tokens for a given user. Used for "log out of all devices".
 * Effectively terminates all login sessions for the user.
 * @param userId - The user's ID.
 * @throws {Error} Throws a generic error if a database error occurs.
 */
export function deleteAllRefreshTokensForUser(userId: number): void {
	const query = `DELETE FROM refresh_tokens WHERE user_id = ?`;
	try {
		db.run(query, [userId]);
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(
			`Database error while deleting all refresh tokens for userId ${userId}: ${message}`,
			'errLog.txt',
		);
		throw new Error('A database error occurred while processing the refresh token.');
	}
}

/**
 * Updates the IP address for a given token.
 * @param token - The token to update.
 * @param ip - The new IP address to record.
 * @throws {Error} Throws a generic error if a database error occurs.
 */
export function updateRefreshTokenIP(token: string, ip: string | null): void {
	const query = `UPDATE refresh_tokens SET ip_address = ? WHERE token = ?`;
	try {
		db.run(query, [ip, token]);
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(
			`Database error while updating refresh token IP: ${message}`,
			'errLog.txt',
		);
		throw new Error('A database error occurred while processing the refresh token.');
	}
}
