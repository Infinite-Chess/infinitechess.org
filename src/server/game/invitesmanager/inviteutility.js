
/*
 * This script stores utility methods for working
 * with single invites, not multiple
 */

import jsutil from '../../../client/scripts/esm/util/jsutil.js';

/** @typedef {import("../../socket/socketUtility.js").CustomWebSocket} CustomWebSocket */

//-------------------------------------------------------------------------------------------

/**
 * @typedef {Object} Invite - The invite object.
 * @property {string} id - A unique identifier, containing lowercase letters a-z and numbers 0-9.
 * @property {Object} name - The display name of the owner, "(Guest)" if not logged in.
 * @property {Object} owner - An object with either the `member` or `browser` property, which tells us who owns it.
 * @property {string} tag - Used to verify if an invite is your own.
 * @property {string} variant - The name of the variant this invite is for
 * @property {string} clock - The clock value: "s+s"
 * @property {string} color - white/black
 * @property {string} rated - rated/casual
 * @property {string} publicity - Whether this is a "public"/"private" game.
 */

//-------------------------------------------------------------------------------------------

/**
 * Returns true if the invite is private
 * @param {Invite} invite 
 * @returns {boolean}
 */
function isInvitePrivate(invite) {
	return invite.publicity === 'private';
}

/**
 * Returns true if the invite is public
 * @param {Invite} invite 
 * @returns {boolean}
 */
function isInvitePublic(invite) {
	return invite.publicity === 'public';
}

/**
 * Removes sensitive data such as their browser-id.
 * MODIFIES the invite! Make sure it's a copy!
 * @param {Invite} invite - A copy of the invite
 * @returns {Invite}
 */
function makeInviteSafe(invite) {
	delete invite.owner;
	return invite;
}

/**
 * Makes a deep copy of provided invite, and
 * removes sensitive data such as their browser-id.
 * @param {Invite} invite
 * @returns {Invite}
 */
function safelyCopyInvite(invite) {
	const inviteDeepCopy = jsutil.deepCopyObject(invite);
	return makeInviteSafe(inviteDeepCopy);
}

/**
 * Tests if the provided invite belongs to the provided socket.
 * @param {CustomWebSocket} ws 
 * @param {Invite} invite 
 * @returns {boolean}
 */
function isInviteOurs(ws, invite) {
	return ws.metadata.memberInfo.signedIn && ws.metadata.memberInfo.username === invite.owner.member
        || ws.metadata.cookies['browser-id'] && ws.metadata.cookies['browser-id'] === invite.owner.browser;
}

/**
 * Tests if the provided invite belongs to the provided identifier.
 * @param {boolean} signedIn - Whether the user is signed in or not
 * @param {string} identifier - The username (if signed in) or the browser ID (if not signed in)
 * @param {Invite} invite - The invite object to test
 * @returns {boolean} - Returns true if the invite belongs to the provided identifier, false otherwise
 */
function isInviteOursByIdentifier(signedIn, identifier, invite) {
	if (signedIn) return invite.owner.member === identifier; // Compare with username if signed in
	else return invite.owner.browser === identifier; // Compare with browser ID if not signed in
}

//-------------------------------------------------------------------------------------------

export {
	isInvitePrivate,
	isInvitePublic,
	makeInviteSafe,
	safelyCopyInvite,
	isInviteOurs,
	isInviteOursByIdentifier,
};