/*
 * This script stores utility methods for working
 * with single invites, not multiple
 */

import jsutil from '../../../shared/util/jsutil.js';

import type { AuthMemberInfo } from '../../types.js';
import type { Game } from '../gamemanager/gameutility.js';
import type { Player } from '../../../shared/chess/util/typeutil.js';
import type { ServerUsernameContainer } from '../../../shared/types.js';

// Type Definitions -------------------------------------------------------------------------------------------

/** A lobby game invite. */
interface Invite extends SafeInvite {
	/** Contains the identifier of the owner of the invite, whether a member or browser. */
	owner: AuthMemberInfo;
}

/**
 * All properties of an invite that is safe to send to clients.
 * Doesn't contain sensitive information such as browser-id cookies.
 */
interface SafeInvite {
	id: string; // A unique identifier, containing lowercase letters a-z and numbers 0-9.
	usernamecontainer: ServerUsernameContainer; // The type of the owner (guest/player), their username, and elo if applicable.
	tag: string; // Used to verify if an invite is your own.
	variant: Game['variant'];
	clock: Game['clock'];
	color: Player;
	rated: 'casual' | 'rated';
	publicity: 'public' | 'private';
}

//-------------------------------------------------------------------------------------------

/**
 * Returns true if the invite is private
 */
function isInvitePrivate(invite: Invite): boolean {
	return invite.publicity === 'private';
}

/**
 * Returns true if the invite is public
 */
function isInvitePublic(invite: Invite): boolean {
	return invite.publicity === 'public';
}

/**
 * Removes sensitive data such as their browser-id.
 * Returns a deep copy of the original invite.
 */
function makeInviteSafe(invite: Invite): SafeInvite {
	return {
		id: invite.id,
		usernamecontainer: jsutil.deepCopyObject(invite.usernamecontainer),
		tag: invite.tag,
		variant: invite.variant,
		clock: invite.clock,
		color: invite.color,
		rated: invite.rated,
		publicity: invite.publicity,
	};
}

/**
 * Makes a deep copy of provided invite, and
 * removes sensitive data such as their browser-id.
 */
function safelyCopyInvite(invite: Invite): SafeInvite {
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

export type { Invite, SafeInvite };

export { isInvitePrivate, isInvitePublic, makeInviteSafe, safelyCopyInvite, memberInfoEq };
