// src/server/utility/memberInfoUtil.ts

/**
 * Pure identity-equality helpers for the {@link MemberInfo} / {@link AuthMemberInfo} types.
 */

import type { MemberInfo, AuthMemberInfo } from '../types.js';

/** Compares two MemberInfo objects to see if they are the same person or not. */
function memberInfoEq(u1: AuthMemberInfo, u2: AuthMemberInfo): boolean {
	if (u1.signedIn) {
		if (!u2.signedIn) return false;
		return u1.user_id === u2.user_id;
	} else if (u2.signedIn)
		return false; // This ensures if they have the same browser-id, but mi2 is signed in, they are not equal.
	else return u1.browser_id === u2.browser_id;
}

/**
 * Like {@link memberInfoEq}, but `other` may be partial (browser-id undefined, e.g. `req.memberInfo`).
 * An unidentified guest never matches, so it can't false-positive two unknown guests.
 */
function memberInfoEqPartial(authed: AuthMemberInfo, other: MemberInfo): boolean {
	if (authed.signedIn) return other.signedIn && authed.user_id === other.user_id;
	return (
		!other.signedIn && other.browser_id !== undefined && authed.browser_id === other.browser_id
	);
}

export { memberInfoEq, memberInfoEqPartial };
