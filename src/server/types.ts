// src/server/types.ts

/**
 * Shared server-side type definitions: roles, and module augmentations that attach
 * `memberInfo`, the resolved language, and translations onto Express's Request.
 */

import type { IncomingMessage } from 'http';
import type { ScriptTranslations } from '../shared/types/script-translations.js';

// Roles ------------------------------------------------------------------------------------------

/**
 * All possible roles, IN ORDER FROM LEAST TO MOST IMPORTANCE!
 * The ordering determines admin's capabilities in the admin console.
 */
export const VALID_ROLES = ['patron', 'admin', 'owner'] as const;

/** A valid role of a user. */
export type Role = (typeof VALID_ROLES)[number];

// Module augmentations ---------------------------------------------------------------------------

declare global {
	namespace Express {
		export interface Request {
			memberInfo?: MemberInfo;
			/**
			 * The resolved best-fit supported language to serve this request.
			 * Set lazily via reqLanguage.ts
			 */
			lang: string;
			/**
			 * Contains all translations for the request's resolved language.
			 * Mirrors the client's global `t`. Set lazily via reqTranslations.ts.
			 */
			t: ScriptTranslations;
		}
	}
}

/*
 * Declares the `closeTimeout` server option, present in ws since 8.19
 * but absent from @types/ws 8.18.1, the latest published.
 *
 * Delete this once the types catch up.
 */
declare module 'ws' {
	namespace WebSocket {
		interface ServerOptions<
			// eslint-disable-next-line
			U extends typeof WebSocket = typeof WebSocket,
			// eslint-disable-next-line
			V extends typeof IncomingMessage = typeof IncomingMessage,
		> {
			closeTimeout?: number | undefined;
		}
	}
}

// Member identity --------------------------------------------------------------------------------

/** Information to identify a specific user, logged in or not. */
export type MemberInfo = SignedInMemberInfo | SignedOutMemberInfo;

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
 * {@link MemberInfo}, but the browser_id is guaranteed to be defined.
 * This means the user is fully authenticated, cause we only need one
 * identifier to identify them.
 */
export type AuthMemberInfo = MemberInfo & { browser_id: string };

// Cookies ----------------------------------------------------------------------------------------

/** All possible cookies we set on the client. */
export interface ParsedCookies {
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
	memberInfo?: string; // Stringified MemberInfoCookie (src/shared/types/memberInfo.ts)
}
