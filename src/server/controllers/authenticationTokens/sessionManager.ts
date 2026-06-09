// src/server/controllers/authenticationTokens/sessionManager.ts

/**
 * This module handles the creation, renewal, and revocation of user login sessions.
 * It uses secure cookies and interacts with the `refreshTokenManager` for database operations.
 */

import type { Request, Response } from 'express';
import type { Role } from '../roles.js';
import type { RefreshTokenRecord } from '../../database/refreshTokenManager.js';

import { deletePreferencesCookie } from '../../api/Prefs.js';
import { deletePracticeProgressCookie } from '../../api/PracticeProgress.js';
import { addRefreshToken, markRefreshTokenAsConsumed } from '../../database/refreshTokenManager.js';
import { createMemberInfoCookie, deleteMemberInfoCookie } from './memberInfoCookie.js';
import {
	DEFAULT_SESSION_EXPIRY_MILLIS,
	EXTENDED_SESSION_EXPIRY_MILLIS,
	signRefreshToken,
} from './tokenSigner.js';

const minTimeToWaitToRenewRefreshTokensMillis = 1000 * 60 * 60 * 24; // 1 day
// const minTimeToWaitToRenewRefreshTokensMillis = 1000 * 10; // 10s

// Renewing & Revoking Sessions --------------------------------------------------------------------

/** Makes sure a user's session is still fresh, renewing it if it's older than a day. */
export function freshenSession(
	req: Request,
	res: Response,
	user_id: number,
	username: string,
	roles: Role[] | null,
	tokenRecord: RefreshTokenRecord,
): void {
	// If the token is already consumed (a new one was issued),
	// do not renew it again. Let this request finish using the "dying" token.
	if (tokenRecord.consumed_at) return;

	const timeSinceCreated = Date.now() - tokenRecord.created_at;
	if (timeSinceCreated < minTimeToWaitToRenewRefreshTokensMillis) return;

	// console.log(
	// 	`Renewing member "${username}"s session by issuing them new login cookies! -------`,
	// );

	// Renew with the same session type the user originally chose
	const keepLoggedIn = Boolean(tokenRecord.is_persistent);
	const expiryMillis = keepLoggedIn
		? EXTENDED_SESSION_EXPIRY_MILLIS
		: DEFAULT_SESSION_EXPIRY_MILLIS;

	// Create the new token.
	const newToken = signRefreshToken(user_id, username, roles, expiryMillis);

	// Mark old token as consumed so it has a short grace period before it is fully invalidated.
	markRefreshTokenAsConsumed(tokenRecord.token);
	// Add the new token to the database.
	addRefreshToken(req, user_id, newToken, expiryMillis, keepLoggedIn);

	// Send the new token to the user in their cookies.
	createSessionCookies(res, user_id, username, newToken, expiryMillis);
}

/**
 * Creates a new login session for a user when they login.
 * @param req - The Request object.
 * @param res - The Response object.
 * @param user_id - The unique id of the user in the database.
 * @param username - The username of the user.
 * @param roles - The roles the user has.
 * @param keepLoggedIn - Whether the session is given a much longer expiry
 * 						 window before it logs them out due to inactivity.
 */
export function createNewSession(
	req: Request,
	res: Response,
	user_id: number,
	username: string,
	roles: Role[] | null,
	keepLoggedIn: boolean,
): void {
	const expiryMillis = keepLoggedIn
		? EXTENDED_SESSION_EXPIRY_MILLIS
		: DEFAULT_SESSION_EXPIRY_MILLIS;

	// The payload can be an object with their username and their roles.
	const refreshToken = signRefreshToken(user_id, username, roles, expiryMillis);

	// Save the refresh token to the database
	addRefreshToken(req, user_id, refreshToken, expiryMillis, keepLoggedIn);

	createSessionCookies(res, user_id, username, refreshToken, expiryMillis);
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
 * @param expiryMillis - How long, in milliseconds, the cookies should live (match the token's expiry).
 */
function createSessionCookies(
	res: Response,
	userId: number,
	username: string,
	refreshToken: string,
	expiryMillis: number,
): void {
	// Create and sets an HTTP-only cookie containing the refresh token.
	// Cross-site usage requires we set sameSite to none! Also requires secure (https) true.
	res.cookie('jwt', refreshToken, {
		httpOnly: true,
		sameSite: 'none',
		secure: true,
		maxAge: expiryMillis,
	});
	createMemberInfoCookie(res, userId, username, expiryMillis);
}

/**
 * Deletes the cookies that store session information.
 * @param res - The response object.
 */
function deleteSessionCookies(res: Response): void {
	// Clear the HTTP-only 'jwt' cookie by setting the same options as when it was created.
	res.clearCookie('jwt', { httpOnly: true, sameSite: 'none', secure: true });
	deleteMemberInfoCookie(res);
}
