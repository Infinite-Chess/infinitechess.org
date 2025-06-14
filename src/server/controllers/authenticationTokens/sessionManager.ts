
/**
 * This module handles the creation, renewal, and revocation of user login sessions.
 * It uses secure cookies and interacts with the `refreshTokenManager` for database operations.
 */


// @ts-ignore
import { deletePreferencesCookie } from '../../api/Prefs.js';
// @ts-ignore
import { signRefreshToken } from './tokenSigner.js';
// @ts-ignore
import { minTimeToWaitToRenewRefreshTokensMillis, refreshTokenExpiryMillis } from '../../config/config.js';
import { deletePracticeProgressCookie } from '../../api/PracticeProgress.js';
import { logEventsAndPrint } from '../../middleware/logEvents.js';
import { findRefreshToken, addRefreshToken, deleteRefreshToken, updateRefreshTokenIP } from '../../database/refreshTokenManager.js';


import type { Request, Response } from 'express';
import type { RefreshTokenRecord } from '../../database/refreshTokenManager.js';


// Renewing & Revoking Sessions --------------------------------------------------------------------


/**
 * Checks if a member has a specific refresh token and that it's not expired.
 * If they do, and it wasn't recently issued, we automatically
 * refresh it by giving them a new refresh cookie.
 * 
 * @param userId - The user ID of the member whose refresh tokens are to be checked.
 * @param username - The username of the user.
 * @param roles - The roles the user has.
 * @param token - The refresh token to check.
 * @param IP - The IP address they are connecting from.
 * @param req - The request object.
 * @param res - The response object. If provided, we will renew their refresh token cookie if it's been a bit.
 * @returns - Returns true if the member has the refresh token, false otherwise.
 */
export function doesMemberHaveRefreshToken_RenewSession(
	userId: number,
	username: string,
	roles: string[] | null,
	token: string,
	IP: string | undefined,
	req: Request,
	res: Response
): boolean {
	// 1. Find the token in the database. This is a single, indexed query.
	const tokenRecord = findRefreshToken(token);

	// 2. If not found, the token is invalid.
	if (!tokenRecord) {
		return false;
	}

	// 3. Security Check: Does the token belong to the user who claims it?
	if (tokenRecord.user_id !== userId) {
		logEventsAndPrint(`SECURITY: User ID mismatch for refresh token! Claimed: ${userId}, Actual: ${tokenRecord.user_id}, Token: ${token}`, 'hackLog.txt');
		// CRITICAL: Invalidate this mismatched token immediately.
		deleteRefreshToken(token);
		return false;
	}

	// 4. Check if the token is expired.
	if (tokenRecord.expires_at < Date.now()) {
		// The token is expired, remove it from the database for cleanup.
		deleteRefreshToken(token);
		return false;
	}

	// 5. Update the IP address if it has changed.
	const IP_New: string | null = IP || null;
	if (IP_New !== tokenRecord.ip_address) {
		updateRefreshTokenIP(token, IP_New);
	}

	// 6. The token is valid. Decide whether to renew the session.
	renewSession(req, res, userId, username, roles, tokenRecord);

	return true;
}

/**
 * Renews a player's login session if enough time has passed.
 * @param req - The Request object.
 * @param res - The Response object.
 * @param userId - The unique id of the user in the database.
 * @param username - The username of the user.
 * @param roles - The roles the user has.
 * @param tokenRecord - The existing, valid token record from the database.
 */
function renewSession(
	req: Request | undefined,
	res: Response | undefined,
	userId: number,
	username: string,
	roles: string[] | null,
	tokenRecord: RefreshTokenRecord
): void {
	// Only renew if we have a response object to send the cookie back.
	if (!req || !res) return;
	
	const timeSinceCreated = Date.now() - tokenRecord.created_at;
	if (timeSinceCreated < minTimeToWaitToRenewRefreshTokensMillis) return;

	console.log(`Renewing member "${username}"s session by issuing them new login cookies! -------`);

	// Create the new token BEFORE touching the database.
	const newToken = signRefreshToken(userId, username, roles);

	// Atomically swap the old token for the new one.
	// In a high-concurrency environment, this should be a single transaction.
	// For now, sequential operations are acceptable.
	deleteRefreshToken(tokenRecord.token);
	addRefreshToken(req, userId, newToken);

	// Send the new token to the user in their cookies.
	createSessionCookies(res, userId, username, newToken);
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
	createRefreshTokenCookie(res, refreshToken);
	createMemberInfoCookie(res, userId, username);
}

/**
 * Deletes the cookies that store session information.
 * @param res - The response object.
 */
function deleteSessionCookies(res: Response): void {
	deleteRefreshTokenCookie(res);
	deleteMemberInfoCookie(res);
}

/**
 * Creates and sets an HTTP-only cookie containing the refresh token.
 * @param res - The response object.
 * @param refreshToken - The refresh token to be stored in the cookie.
 */
function createRefreshTokenCookie(res: Response, refreshToken: string): void {
	// Cross-site usage requires we set sameSite to none! Also requires secure (https) true.
	res.cookie('jwt', refreshToken, { httpOnly: true, sameSite: 'none', secure: true, maxAge: refreshTokenExpiryMillis });
}

/**
 * Deletes the HTTP-only refresh token cookie.
 * @param res - The response object.
 */
function deleteRefreshTokenCookie(res: Response): void {
	// Clear the 'jwt' cookie by setting the same options as when it was created.
	res.clearCookie('jwt', { httpOnly: true, sameSite: 'none', secure: true });
}

/**
 * Creates and sets a cookie containing user info (user ID and username),
 * accessible by JavaScript, with the same expiration as the refresh token.
 * @param res - The response object.
 * @param userId - The ID of the user.
 * @param username - The username of the user.
 */
function createMemberInfoCookie(res: Response, userId: number, username:string): void {
	// Create an object with member info
	const now = Date.now();
	const expires = now + refreshTokenExpiryMillis;
	const memberInfo = JSON.stringify({ user_id: userId, username, issued: now, expires });

	// Set the cookie (readable by JavaScript, not HTTP-only).
	// Cross-site usage requires we set sameSite to 'None'! Also requires secure (https) true.
	res.cookie('memberInfo', memberInfo, { httpOnly: false, sameSite: 'none', secure: true, maxAge: refreshTokenExpiryMillis });
}

/**
 * Deletes the memberInfo cookie.
 * @param res - The response object.
 */
function deleteMemberInfoCookie(res: Response): void {
	// Clear the 'memberInfo' cookie by setting the same options as when it was created.
	res.clearCookie('memberInfo', { httpOnly: false, sameSite: 'none', secure: true });
}