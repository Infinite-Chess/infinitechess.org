// src/server/controllers/authenticationTokens/refreshTokenCookie.ts

/**
 * Manages the `jwt` cookie — our refresh/session token — creating,
 * reading, and deleting it.
 *
 * This cookie is the source of truth for a user's session validity. Being
 * HTTP-only, it cannot be read or tampered with by client JavaScript.
 *
 * The sister cookie, `memberInfo` (see memberInfoCookie.ts), is provided
 * so the client can know who they are signed in as, but is tamperable (not trusted).
 */

import type { CookieOptions, Response } from 'express';

/** The options the `jwt` cookie is created with; reused (sans `maxAge`) when clearing it. */
const REFRESH_TOKEN_COOKIE_OPTIONS: CookieOptions = {
	httpOnly: true,
	// Cross-site usage requires sameSite 'none', which in turn requires secure (https) true.
	sameSite: 'none',
	secure: true,
};

/**
 * Creates and sets the HTTP-only `jwt` cookie containing the refresh token.
 * @param expiryMillis - How long, in milliseconds, the cookie should live (match the token's expiry).
 */
function createRefreshTokenCookie(res: Response, refreshToken: string, expiryMillis: number): void {
	res.cookie('jwt', refreshToken, { ...REFRESH_TOKEN_COOKIE_OPTIONS, maxAge: expiryMillis });
}

/** Clears the `jwt` cookie, using the same options it was created with. */
function deleteRefreshTokenCookie(res: Response): void {
	res.clearCookie('jwt', REFRESH_TOKEN_COOKIE_OPTIONS);
}

export { createRefreshTokenCookie, deleteRefreshTokenCookie };
