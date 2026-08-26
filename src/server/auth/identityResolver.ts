// src/server/auth/identityResolver.ts

/**
 * Resolves who is on the other end of a connection by validating their refresh-token
 * cookie against the database. Shared by HTTP middleware (resolveAuth.ts) and websocket
 * upgrade requests (socketOpen.ts).
 */

import type { TokenPayload } from '../utility/tokenSigner.js';
import type { RefreshTokenRecord } from '../database/refreshTokenManager.js';
import type { MemberInfo, AuthMemberInfo } from '../types.js';

import refreshTokenManager from '../database/refreshTokenManager.js';

/** What {@link resolveIdentity} resolves: possibly-upgraded identity, plus the successful validation. */
interface Resolution<M extends MemberInfo> {
	memberInfo: M;
	/** Present iff the refresh token validated. Callers holding a `res` need it to renew or revoke the session. */
	validation?: { payload: TokenPayload; tokenRecord: RefreshTokenRecord };
}

/**
 * Validates the refresh token against the database, upgrading `memberInfo` to the
 * signed-in member's identity on success. Absent or invalid tokens leave `memberInfo`
 * unchanged. Does database work — only call where authentication is needed.
 */
function resolveIdentity(
	memberInfo: AuthMemberInfo,
	refreshToken: string | undefined,
	IP?: string,
): Resolution<AuthMemberInfo>;
function resolveIdentity(
	memberInfo: MemberInfo,
	refreshToken: string | undefined,
	IP?: string,
): Resolution<MemberInfo>;
function resolveIdentity(
	memberInfo: MemberInfo,
	refreshToken: string | undefined,
	IP?: string,
): Resolution<MemberInfo> {
	if (!refreshToken) return { memberInfo }; // No refresh token present

	const validation = refreshTokenManager.validate(refreshToken, IP);
	if (!validation) return { memberInfo }; // Expired, tampered, logged out, or account deleted

	return {
		memberInfo: { ...memberInfo, signedIn: true, ...validation.payload }, // Username was our payload when we generated the access token
		validation,
	};
}

export default { resolveIdentity };
