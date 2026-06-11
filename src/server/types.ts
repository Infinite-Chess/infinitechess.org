// src/server/types.ts

import type { Role } from './controllers/roles';
import type { ScriptTranslations } from '../shared/types/script-translations.js';

declare global {
	namespace Express {
		export interface Request {
			memberInfo?: MemberInfo;
			/** The resolved language to serve this request, set by the resolveLanguage middleware. */
			lang?: string;
			/** Contains all translations for the request's resolved language. */
			t: ScriptTranslations;
		}
	}
}

/** Information to identify a specific user, logged in or not. */
type MemberInfo = SignedInMemberInfo | SignedOutMemberInfo;

export type SignedInMemberInfo = {
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
	/** Their preferred language override. For example, 'de-DE'. */
	lang?: string;
	/** Their refresh/session token, if they are signed in. Can be decoded to obtain their payload. */
	jwt?: string;
	/**
	 * Information about the session for the user to read.
	 * The server must NOT trust this information as it can be tampered!
	 */
	memberInfo?: string; // Stringified: { user_id: number, username: string, issued: number, expires: number }
}

export type { MemberInfo, AuthMemberInfo, ParsedCookies };
