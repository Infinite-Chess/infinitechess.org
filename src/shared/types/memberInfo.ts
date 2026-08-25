// src/shared/types/memberInfo.ts

/**
 * The shape of the JavaScript-readable `memberInfo` cookie: who the client is signed in as.
 * The server writes it when issuing a session; the client reads it to know its own identity.
 * It is NOT a source of session-validity truth (tamperable) — only the httpOnly refresh token is.
 */
export type MemberInfoCookie = {
	user_id: number;
	username: string;
	/** When the session was issued, in milliseconds since the epoch. */
	issued: number;
	/** When the session expires, in milliseconds since the epoch. */
	expires: number;
};
