// src/server/controllers/authenticationTokens/memberInfoCookie.ts

/**
 * Manages the `memberInfo` cookie — creating, reading/validating, and deleting it.
 *
 * This cookie tells the client who they are signed in as, but it is
 * NOT the source of truth for the user's session validity — that is the
 * refresh token, which is HTTP-only and thus not tamperable by the client.
 *
 * The sister cookie, `jwt` (see refreshTokenCookie.ts), IS the source of truth
 * for a user's session validity, being HTTP-only and not tamperable.
 */

import type { Request, Response } from 'express';
import type { ParsedCookies } from '../../types.js';

import jsutil from '../../../shared/util/jsutil.js';

import { logEventsAndPrint } from '../../middleware/logEvents.js';

/** The shape of the (JavaScript-readable) `memberInfo` cookie. */
export type MemberInfoCookie = {
	user_id: number;
	username: string;
	/** When the session was issued, in milliseconds since the epoch. */
	issued: number;
	/** When the session expires, in milliseconds since the epoch. */
	expires: number;
};

/**
 * Sets the `memberInfo` cookie (readable by JavaScript, not HTTP-only).
 * @param expiryMillis - How long, in milliseconds, the cookie should live (match the refresh token's expiry).
 */
function createMemberInfoCookie(
	res: Response,
	user_id: number,
	username: string,
	expiryMillis: number,
): void {
	const now = Date.now();
	const memberInfo: MemberInfoCookie = {
		user_id,
		username,
		issued: now,
		expires: now + expiryMillis,
	};

	res.cookie('memberInfo', JSON.stringify(memberInfo), {
		httpOnly: false,
		sameSite: 'lax',
		secure: true,
		maxAge: expiryMillis,
	});
}

/** Clears the `memberInfo` cookie, using the same options it was created with. */
function deleteMemberInfoCookie(res: Response): void {
	res.clearCookie('memberInfo', { httpOnly: false, sameSite: 'lax', secure: true });
}

/**
 * Reads, parses, and validates the `memberInfo` cookie from a request.
 * @returns The validated cookie, or `undefined` if it is absent (signed out) or tampered.
 */
function readMemberInfoCookie(req: Request): MemberInfoCookie | undefined {
	const cookies: ParsedCookies = req.cookies;
	const stringified = cookies.memberInfo;
	if (stringified === undefined) return undefined; // No cookie present, not logged in.

	try {
		const parsed: unknown = JSON.parse(stringified);
		if (!isMemberInfoCookie(parsed)) throw new Error('Invalid structure');
		return parsed;
	} catch (error: unknown) {
		const detail = error instanceof Error ? error.stack : String(error);
		logEventsAndPrint(
			`memberInfo cookie was tampered: "${jsutil.ensureJSONString(stringified)}"\n${detail}`,
			'errLog',
		);
		return undefined;
	}
}

/** Type guard: whether a JSON-parsed value matches the {@link MemberInfoCookie} shape. */
function isMemberInfoCookie(value: unknown): value is MemberInfoCookie {
	return (
		typeof value === 'object' &&
		value !== null &&
		'user_id' in value &&
		typeof value.user_id === 'number' &&
		'username' in value &&
		typeof value.username === 'string' &&
		'issued' in value &&
		typeof value.issued === 'number' &&
		'expires' in value &&
		typeof value.expires === 'number'
	);
}

export { createMemberInfoCookie, deleteMemberInfoCookie, readMemberInfoCookie };
