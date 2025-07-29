
/**
 * This module handles the creation, renewal, and revocation of user login sessions.
 * It uses secure cookies and interacts with the `refreshTokenManager` for database operations.
 */


// @ts-ignore
import { deletePreferencesCookie } from '../../api/Prefs.js';
import { refreshTokenExpiryMillis, signRefreshToken } from './tokenSigner.js';
import { deletePracticeProgressCookie } from '../../api/PracticeProgress.js';
import { findRefreshToken, addRefreshToken, deleteRefreshToken, updateRefreshTokenIP } from '../../database/refreshTokenManager.js';


import type { Request, Response } from 'express';
import type { RefreshTokenRecord } from '../../database/refreshTokenManager.js';


const minTimeToWaitToRenewRefreshTokensMillis = 1000 * 60 * 60 * 24; // 1 day
// const minTimeToWaitToRenewRefreshTokensMillis = 1000 * 30; // 30s


// Renewing & Revoking Sessions --------------------------------------------------------------------


/**
 * Checks if a specific refresh token is present in the database, and has not expired,
 * deleting it if it has expired, and updating its last used IP address if it has changed.
 * If not present, it means it has either expired, been manually invalidated by the user logging out, or deleting their account.
 * 
 * Returns the token record if found and valid, otherwise undefined.
 */
export function resolveRefreshTokenRecord(
	token: string,
	IP?: string,
): RefreshTokenRecord | undefined {
	// Find the token in the database.
	const tokenRecord = findRefreshToken(token);

	if (!tokenRecord) return; // Token must have been manually invalidated by the user logging out, or deleting their account.

	// Check if it is expired.
	if (tokenRecord.expires_at < Date.now()) {
		// The token is expired, remove it from the database for cleanup.
		deleteRefreshToken(token);
		return;
	}

	// Update the IP address if it has changed.
	const IP_New: string | null = IP || null;
	if (IP_New !== tokenRecord.ip_address) {
		updateRefreshTokenIP(token, IP_New);
	}

	return tokenRecord;
}

/** Makes sure a user's session is still fresh, renewing it if it's older than a day. */
export function freshenSession(
	req: Request,
	res: Response,
	user_id: number,
	username: string,
	roles: string[] | null,
	tokenRecord: RefreshTokenRecord
): void {
	const timeSinceCreated = Date.now() - tokenRecord.created_at;
	if (timeSinceCreated < minTimeToWaitToRenewRefreshTokensMillis) return;

	console.log(`Renewing member "${username}"s session by issuing them new login cookies! -------`);

	// Create the new token BEFORE touching the database.
	const newToken = signRefreshToken(user_id, username, roles);

	// Atomically swap the old token for the new one.
	// In a high-concurrency environment, this should be a single transaction.
	// For now, sequential operations are acceptable.
	deleteRefreshToken(tokenRecord.token);
	addRefreshToken(req, user_id, newToken);

	// Send the new token to the user in their cookies.
	createSessionCookies(res, user_id, username, newToken);
}

/**
 * Creates a new login session for a user when they login.
 * @param req - The Request object.
 * @param res - The Response object.
 * @param user_id - The unique id of the user in the database.
 * @param username - The username of the user.
 * @param roles - The roles the user has.
 */
export function createNewSession(
	req: Request,
	res: Response,
	user_id: number,
	username: string,
	roles: string[] | null
): void {
	// The payload can be an object with their username and their roles.
	const refreshToken = signRefreshToken(user_id, username, roles);
    
	// Save the refresh token to the database
	addRefreshToken(req, user_id, refreshToken);
    
	createSessionCookies(res, user_id, username, refreshToken);
}

/**
 * Terminates the session of a client by deleting their session, preferences, and practice progress cookies.
 * 
 * NOTE: This only clears the cookies from the user's browser.
 * To invalidate the token on the server side, you must also call `deleteRefreshToken(token)`.
 * This is typically done in a logout route handler.
 * @param res - The response object.
 */
export function revokeSession(res: Response): void {
	deleteSessionCookies(res);
	deletePreferencesCookie(res); // Even though this cookie expires after 10 seconds, it's good to delete it here anyway.
	deletePracticeProgressCookie(res);
}


// Cookies storing session information --------------------------------------------------------------------


/**
 * Creates and sets the cookies:
 * * `memberInfo` containing user info (user ID and username),
 * * `jwt` containing our refresh token.
 * @param res - The response object.
 * @param userId - The ID of the user.
 * @param username - The username of the user.
 * @param refreshToken - The refresh token to be stored in the cookie.
 */
function createSessionCookies(res: Response, userId: number, username: string, refreshToken: string): void {
	// Create and sets an HTTP-only cookie containing the refresh token.
	// Cross-site usage requires we set sameSite to none! Also requires secure (https) true.
	res.cookie('jwt', refreshToken, { httpOnly: true, sameSite: 'none', secure: true, maxAge: refreshTokenExpiryMillis });
	createMemberInfoCookie(res, userId, username);
}

/**
 * Creates and sets a cookie containing user info (user ID and username),
 * accessible by JavaScript, with the same expiration as the refresh token.
 * @param res - The response object.
 * @param userId - The ID of the user.
 * @param username - The username of the user.
 */
function createMemberInfoCookie(res: Response, userId: number, username: string): void {
	// Create an object with member info
	const now = Date.now();
	const expires = now + refreshTokenExpiryMillis;
	const memberInfo = JSON.stringify({ user_id: userId, username, issued: now, expires });

	// Set the cookie (readable by JavaScript, not HTTP-only).
	// Cross-site usage requires we set sameSite to 'None'! Also requires secure (https) true.
	res.cookie('memberInfo', memberInfo, { httpOnly: false, sameSite: 'none', secure: true, maxAge: refreshTokenExpiryMillis });
}

/**
 * Deletes the cookies that store session information.
 * @param res - The response object.
 */
function deleteSessionCookies(res: Response): void {
	// Clear the HTTP-only 'jwt' cookie by setting the same options as when it was created.
	res.clearCookie('jwt', { httpOnly: true, sameSite: 'none', secure: true });
	// Clear the 'memberInfo' cookie by setting the same options as when it was created.
	res.clearCookie('memberInfo', { httpOnly: false, sameSite: 'none', secure: true });
}
