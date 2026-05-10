// src/server/game/invitesmanager/inviteutility.ts

/*
 * This script stores utility methods for working
 * with single invites, not multiple
 */

import type { LobbySeek } from '../../../shared/types.js';
import type { AuthMemberInfo } from '../../types.js';

import jsutil from '../../../shared/util/jsutil.js';

// Type Definitions

/** A lobby game invite. */
export interface AuthSeek extends LobbySeek {
	/** Contains the identifier of the owner of the invite, whether a member or browser. */
	owner: AuthMemberInfo;
}

//-------------------------------------------------------------------------------------------

/**
 * Removes sensitive data such as their browser-id.
 * Returns a deep copy of the original invite.
 */
function makeInviteSafe(invite: AuthSeek): LobbySeek {
	return {
		id: invite.id,
		player: jsutil.deepCopyObject(invite.player),
		tag: invite.tag,
		variant: jsutil.deepCopyObject(invite.variant),
		time: invite.time,
		color: invite.color,
		mode: invite.mode,
	};
}

/**
 * Makes a deep copy of provided invite, and
 * removes sensitive data such as their browser-id.
 */
function safelyCopyInvite(invite: AuthSeek): LobbySeek {
	const inviteDeepCopy = jsutil.deepCopyObject(invite);
	return makeInviteSafe(inviteDeepCopy);
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

export { safelyCopyInvite, memberInfoEq };
