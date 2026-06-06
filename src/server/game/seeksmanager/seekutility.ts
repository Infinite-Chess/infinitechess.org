// src/server/game/seeksmanager/seekutility.ts

/*
 * This script stores utility methods for working
 * with single seeks, not multiple
 */

import type { AuthMemberInfo } from '../../types.js';
import type { AuthSeekVariant, BaseSeek, OutSeek, OutSeekVariant } from '../../../shared/types.js';

import jsutil from '../../../shared/util/jsutil.js';

// Type Definitions

/** A lobby game seek, WITH the owner's sensitive information. */
export interface AuthSeek extends BaseSeek {
	/** Contains the identifier of the owner of the seek, whether a member or browser. */
	owner: AuthMemberInfo;
	variant: AuthSeekVariant;
}

//-------------------------------------------------------------------------------------------

/**
 * Removes sensitive data such as their browser-id.
 * Returns a deep copy of the original seek.
 * Also strips ICN content from the variant so the full position text is not
 * broadcast to every lobby viewer.
 */
function makeSeekSafe(seek: AuthSeek): OutSeek {
	const variant: OutSeekVariant =
		seek.variant.kind === 'preset' ? seek.variant : { kind: 'custom' };

	return {
		id: seek.id,
		player: jsutil.deepCopyObject(seek.player),
		tag: seek.tag,
		variant,
		time: seek.time,
		color: seek.color,
		mode: seek.mode,
		modifiers: jsutil.deepCopyObject(seek.modifiers),
	};
}

/**
 * Makes a deep copy of provided seek, and
 * removes sensitive data such as their browser-id.
 */
function safelyCopySeek(seek: AuthSeek): OutSeek {
	const seekDeepCopy = jsutil.deepCopyObject(seek);
	return makeSeekSafe(seekDeepCopy);
}

/** Compares two MemberInfo objects to see if they are the same person or not. */
function memberInfoEq(u1: AuthMemberInfo, u2: AuthMemberInfo): boolean {
	if (u1.signedIn) {
		if (!u2.signedIn) return false;
		return u1.user_id === u2.user_id;
	} else if (u2.signedIn)
		return false; // This ensures if they have the same browser-id, but mi2 is signed in, they are not equal.
	else return u1.browser_id === u2.browser_id;
}

//-------------------------------------------------------------------------------------------

export { safelyCopySeek, memberInfoEq };
