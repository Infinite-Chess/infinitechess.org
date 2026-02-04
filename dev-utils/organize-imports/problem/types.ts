// src/server/types.ts

import { Request } from 'express';
import type { Role } from './controllers/roles';

/**
 * A req object, but with their memberInfo defined. This may include
 * information about their signed-in status, or their browser-id cookie.
 * Point is we now have an identifier for them.
 */
interface IdentifiedRequest extends Request {
	memberInfo: MemberInfo;
}

/**
 * Single source of truth for determining whether a req object has been
 * given all properties required for the {@link IdentifiedRequest} type.
 */
function isRequestIdentified(req: Request): req is IdentifiedRequest {
	return !!req.memberInfo;
}

/** Information to identify a specific user, logged in or not. */
type MemberInfo = SignedInMemberInfo | SignedOutMemberInfo;

type SignedInMemberInfo = {
	signedIn: true;
	user_id: number;
	username: string;
	roles: Role[] | null;
	browser_id?: string;
};

type SignedOutMemberInfo = {
	signedIn: false;
	browser_id?: string;
};

/**
 * @type {MemberInfo}, but the browser_id is guaranteed to be defined.
 * This means the user is fully authenticated, cause we only need one
 * identifier to identify them.
 */
type AuthMemberInfo = MemberInfo & { browser_id: string };

/** All possible cookies we set on the client. */
interface ParsedCookies {
	/** The unique id of the browser. Almost always defined, but may not be on first connection, or if client's cookies are disabled. */
	'browser-id'?: string;
	/** Their preferred language. For example, 'en-US'. This is determined by their `i18next` cookie. */
	i18next?: string;
	/** Their refresh/session token, if they are signed in. Can be decoded to obtain their payload. */
	jwt?: string;
	/**
	 * Information about the session for the user to read.
	 * The server must NOT trust this information as it can be tampered!
	 */
	memberInfo?: string; // Stringified: { user_id: number, username: string, issued: number, expires: number }
}

export { isRequestIdentified };

export type { IdentifiedRequest, SignedInMemberInfo, MemberInfo, AuthMemberInfo, ParsedCookies };
