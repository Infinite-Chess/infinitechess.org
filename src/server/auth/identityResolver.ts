// src/server/auth/identityResolver.ts

/**
 * Resolves who is on the other end of a connection by validating their refresh-token
 * cookie against the database. Shared by HTTP middleware (resolveAuth.ts) and websocket
 * upgrade requests (socketOpen.ts).
 */

import type { TokenPayload } from '../utility/tokenSigner.js';
import type { RefreshTokenRecord } from '../database/refreshTokenManager.js';
import type { MemberInfo, AuthMemberInfo } from '../types.js';

import tokenSigner from '../utility/tokenSigner.js';
import memberManager from '../database/memberManager.js';
import refreshTokenManager from '../database/refreshTokenManager.js';

// Types -----------------------------------------------------------------------

/** A successfully validated refresh token. */
interface Validation {
	payload: TokenPayload;
	tokenRecord: RefreshTokenRecord;
}

/** What {@link resolve} resolves: possibly-upgraded identity, plus the successful validation. */
interface Resolution<M extends MemberInfo> {
	memberInfo: M;
	/** Present iff the refresh token validated. Callers holding a `res` need it to renew or revoke the session. */
	validation?: Validation;
}

// Resolving -------------------------------------------------------------------

/**
 * Validates the refresh token against the database, upgrading `memberInfo` to the
 * signed-in member's identity on success. Absent or invalid tokens leave `memberInfo`
 * unchanged. Does database work — only call where authentication is needed.
 */
function resolve(
	memberInfo: AuthMemberInfo,
	refreshToken: string | undefined,
	IP?: string,
): Resolution<AuthMemberInfo>;
function resolve(
	memberInfo: MemberInfo,
	refreshToken: string | undefined,
	IP?: string,
): Resolution<MemberInfo>;
function resolve(
	memberInfo: MemberInfo,
	refreshToken: string | undefined,
	IP?: string,
): Resolution<MemberInfo> {
	if (!refreshToken) return { memberInfo }; // No refresh token present

	const validation = validate(refreshToken, IP);
	if (!validation) return { memberInfo };

	return {
		memberInfo: { ...memberInfo, signedIn: true, ...validation.payload },
		validation,
	};
}

/**
 * Checks a presented refresh token is valid: unexpired, untampered, and still live in the database.
 * As side effects, updates the stored IP if it changed, and the member's last_seen.
 * @param IP - Has a chance to not be defined on HTTP requests.
 */
function validate(refreshToken: string, IP?: string): Validation | undefined {
	const payload = tokenSigner.verify(refreshToken);
	if (!payload) return undefined; // Expired or tampered

	let tokenRecord: RefreshTokenRecord | undefined;
	try {
		tokenRecord = refreshTokenManager.findLive(refreshToken);
		if (!tokenRecord) return undefined; // Logged out, account deleted, or consumed past its grace period

		const ip_address = IP || null;
		if (ip_address !== tokenRecord.ip_address)
			refreshTokenManager.updateIP(refreshToken, ip_address);
	} catch {
		return undefined; // DB error (already logged)
	}

	try {
		memberManager.updateLastSeen(payload.user_id);
	} catch {
		// DB error (already logged). Token is still valid
	}
	return { payload, tokenRecord };
}

// Exports ---------------------------------------------------------------------

export default { resolve };
