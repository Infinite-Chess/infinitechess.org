// src/server/utility/memberinfoutil.ts

/**
 * Pure helpers for the {@link MemberInfo} / {@link AuthMemberInfo} types:
 * comparing two identities, and projecting one into its public form.
 */

import type { Rating } from '../../shared/chess/util/metadatautil.js';
import type { ServerUsernameContainer } from '../../shared/domain.js';
import type { MemberInfo, AuthMemberInfo } from '../types.js';

import metadatautil from '../../shared/chess/util/metadatautil.js';

// Equality --------------------------------------------------------------------------------------

/** Compares two MemberInfo objects to see if they are the same person or not. */
function eq(u1: AuthMemberInfo, u2: AuthMemberInfo): boolean {
	if (u1.signedIn) {
		if (!u2.signedIn) return false;
		return u1.user_id === u2.user_id;
	} else if (u2.signedIn)
		return false; // This ensures if they have the same browser-id, but mi2 is signed in, they are not equal.
	else return u1.browser_id === u2.browser_id;
}

/**
 * Like {@link eq}, but `other` may be partial (browser-id undefined, e.g. `req.memberInfo`).
 * An unidentified guest never matches, so it can't false-positive two unknown guests.
 */
function eqPartial(authed: AuthMemberInfo, other: MemberInfo): boolean {
	if (authed.signedIn) return other.signedIn && authed.user_id === other.user_id;
	return (
		!other.signedIn && other.browser_id !== undefined && authed.browser_id === other.browser_id
	);
}

// Projection ------------------------------------------------------------------------------------

/**
 * Builds the public {@link ServerUsernameContainer} for a player from their auth identity.
 * Guests get the generic ICN guest name. Never exposes `browser_id`.
 */
function buildServerUsernameContainer(
	identifier: AuthMemberInfo,
	rating?: Rating,
): ServerUsernameContainer {
	return {
		type: identifier.signedIn ? 'player' : 'guest',
		username: identifier.signedIn ? identifier.username : metadatautil.GUEST_NAME_ICN_METADATA,
		rating,
	};
}

// Exports ---------------------------------------------------------------------------------------

export default {
	// Equality
	eq,
	eqPartial,
	// Projection
	buildServerUsernameContainer,
};
