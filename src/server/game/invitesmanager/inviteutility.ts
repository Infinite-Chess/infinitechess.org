
/*
 * This script stores utility methods for working
 * with single invites, not multiple
 */

import jsutil from '../../../client/scripts/esm/util/jsutil.js';

// @ts-ignore
import type { ServerUsernameContainer } from '../../../client/scripts/esm/game/misc/invites.js';
import type { MemberInfo } from '../../../types.js';
import type { Game } from '../TypeDefinitions.js';
import type { Player } from '../../../client/scripts/esm/chess/util/typeutil.js';

//-------------------------------------------------------------------------------------------

interface Invite {
	id: string // A unique identifier, containing lowercase letters a-z and numbers 0-9.
	usernamecontainer: ServerUsernameContainer // The type of the owner (guest/player), their username, and elo if applicable.
	tag: string // Used to verify if an invite is your own.
	variant: Game['variant']
	clock: Game['clock']
	color: Player
	rated: "casual" | "rated"
	publicity: "public" | "private"
	
}

interface UnsafeInvite extends Invite {
	owner: MemberInfo // An object with either the `member` or `browser` property, which tells us who owns it.
}

interface SafeInvite extends Invite {
	owner: undefined
}

//-------------------------------------------------------------------------------------------

/**
 * Returns true if the invite is private
 */
function isInvitePrivate(invite: Invite) {
	return invite.publicity === 'private';
}

/**
 * Returns true if the invite is public
 */
function isInvitePublic(invite: Invite) {
	return invite.publicity === 'public';
}

/**
 * Removes sensitive data such as their browser-id.
 * MODIFIES the invite! Make sure it's a copy!
 * @param =invite - A copy of the invite
 */
function makeInviteSafe(invite: Invite) {
	// @ts-ignore
	delete invite.owner;
	return invite as SafeInvite;
}

/**
 * Makes a deep copy of provided invite, and
 * removes sensitive data such as their browser-id.
 */
function safelyCopyInvite(invite: Invite): SafeInvite {
	const inviteDeepCopy = jsutil.deepCopyObject(invite);
	return makeInviteSafe(inviteDeepCopy);
}

function memberInfoEq(u1: MemberInfo, u2: MemberInfo): boolean {
	console.log(u1, u2);
	// @ts-ignore
	if (u1.signedIn) return u1.user_id === u2.user_id;
	// @ts-ignore
	else return u1.browser_id === u2.browser_id;
}

//-------------------------------------------------------------------------------------------

export type {
	Invite,
	UnsafeInvite,
	SafeInvite,
};

export {
	isInvitePrivate,
	isInvitePublic,
	makeInviteSafe,
	safelyCopyInvite,
	memberInfoEq,
};