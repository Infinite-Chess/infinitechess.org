
/**
 * This script manages our list of all active invites,
 * subscribes and unsubs sockets to and from the invites
 * subscription list,
 * and broadcasts changes out to the clients.
 */

import socketUtility from '../../socket/socketUtility.js';
import { isInvitePrivate, makeInviteSafe, safelyCopyInvite, isInviteOurs, isInvitePublic, isInviteOursByIdentifier } from './inviteutility.js';
import { getInviteSubscribers, addSocketToInvitesSubs, removeSocketFromInvitesSubs, doesUserHaveActiveConnection } from './invitessubscribers.js';
import { getActiveGameCount } from '../gamemanager/gamecount.js';
import jsutil from '../../../client/scripts/esm/util/jsutil.js';
import { sendSocketMessage } from '../../socket/sendSocketMessage.js';

/**
 * Type Definitions
 * @typedef {import('./inviteutility.js').Invite} Invite 
 */

/** @typedef {import("../../socket/socketUtility.js").CustomWebSocket} CustomWebSocket */

//-------------------------------------------------------------------------------------------

/** Whether to log new invite creations/deletions to the console */
const printNewInviteCreationsAndDeletions = true;

/** The number of digits generated invite IDs are. */
const IDLengthOfInvites = 5;

/** The list of all active invites, including private ones. @type {Invite[]} */
const invites = [];

/**
 * Time to allow the client to reconnect after an UNEXPECTED (not purposeful)
 * socket closure before any invite of theirs is deleted!
 */
const cushionToDisconnectMillis = 5000; // 5 seconds

/**
 * An object containing usernames for the keys, and setTimeout timer ID's for the values,
 * that represent the timers that are currently active to delete all a player's invites
 * since they've disconnected.
 */
const timersMember = {};
/**
 * An object containing browser-ids for the keys, and setTimeout timer ID's for the values,
 * that represent the timers that are currently active to delete all a browser's invites
 * since they've disconnected.
 */
const timersBrowser = {};

//-------------------------------------------------------------------------------------------

/**
 * Gets the list of public invites with sensitive information REMOVED (such as browser-ids)
 * DOES NOT include private invites, not even your own, ADD THOSE SEPARATELY.
 * @returns {Invite[]}
 */
function getPublicInvitesListSafe() {
	/** @type {Invite[]} */
	const deepCopiedInvites = jsutil.deepCopyObject(invites);
	// Remove private invites
	for (let i = deepCopiedInvites.length - 1; i >= 0; i--) { // Iterate backwards because we are destructive
		const thisInvite = deepCopiedInvites[i];
		if (isInvitePrivate(thisInvite)) deepCopiedInvites.splice(i, 1); // Delete
	}
	// Remove sensitive information
	return removeSensitiveInfoFromInvitesList(deepCopiedInvites);
}

/**
 * Removes browser-id's from the invites list, and makes members' usernames case-sensitive.
 * @param {Invite[]} copyOfInvitesList
 * @returns {Invite[]} The invites list with sensitive info removed.
 */
function removeSensitiveInfoFromInvitesList(copyOfInvitesList) {
	return copyOfInvitesList.map(function(thisInvite, index, copyOfInvitesList) {
		return makeInviteSafe(thisInvite);
	});
}

/**
 * Adds any private invite that belongs to the socket to the provided invites list.
 * @param {CustomWebSocket} ws 
 * @param {Invite[]} copyOfInvitesList - A copy of the invites list, so we don't modify the original
 * @returns {Invite[]}
 */
function addMyPrivateInviteToList(ws, copyOfInvitesList) {
	for (const invite of invites) {
		if (isInvitePublic(invite)) continue; // Next invite, this one isn't private
		if (!isInviteOurs(ws, invite)) continue; // Doesn't belong to us
		const inviteSafeCopy = safelyCopyInvite(invite); // Makes a deep copy and removes sensitive information
		copyOfInvitesList.push(inviteSafeCopy);
	}
	return copyOfInvitesList;
}

// When a PUBLIC invite is added or removed..

/** 
 * Call when a public invite is added or deleted. 
 * @param {CustomWebSocket} ws - The websocket that trigerred this public invites change.
 * @param {number} [replyto] - The ID of the incoming websocket message that triggered this method
 */
function onPublicInvitesChange(ws, replyto) { // The message that this broadcast is the reply to
	broadcastInvites(ws, replyto);
}

/**
 * Broadcasts the invites list out to all subbed clients.
 * @param {CustomWebSocket} ws - The websocket that trigerred this broadcast. Used to include the replyto id for ONLY THEIR message.
 * @param {number} [replyto] - The ID of the incoming websocket message that triggered this broadcast
 */
function broadcastInvites(ws, replyto) {
	const newInvitesList = getPublicInvitesListSafe();
	const currentGameCount = getActiveGameCount();

	const subscribedClients = getInviteSubscribers();
	for (const subbedSocket of Object.values(subscribedClients)) {
		const newInvitesListCopy = jsutil.deepCopyObject(newInvitesList);
		// Only include the replyto code with the invite list if this socket is
		// THE SAME SOCKET as the one that triggered this broadcast.
		const includedReplyTo = ws === subbedSocket ? replyto : undefined;
		sendClientInvitesList(subbedSocket, { invitesList: newInvitesListCopy, currentGameCount, replyto: includedReplyTo });
	}
}

/**
 * Sends the invites list to a specified socket, including any private invites the player owns,
 * and also sends the current active game count.
 * @param {CustomWebSocket} ws - The socket of the player to send the invites list to.
 * @param {Object} [options] - Optional parameters.
 * @param {Invite[]} [options.invitesList=getPublicInvitesListSafe()] - The list of invites to send. Defaults to the public invites list if not provided.
 * @param {number} [options.currentGameCount=getActiveGameCount()] - The current active game count. Defaults to the current game count if not provided.
 * @param {number} [options.replyto] - The incoming websocket message ID, to include in the reply, if applicable.
 */
function sendClientInvitesList(ws, { invitesList = getPublicInvitesListSafe(), currentGameCount = getActiveGameCount(), replyto } = {}) {
	invitesList = addMyPrivateInviteToList(ws, invitesList);
	const message = { invitesList, currentGameCount };
	sendSocketMessage(ws, "invites", "inviteslist", message, replyto); // In order: socket, sub, action, value
}

/**
 * Adds a new invite to the list of active invites.
 * Typically called when an invite is created. Sends the new invites list to the socket.
 * @param {CustomWebSocket} ws - The socket of the player that created this invite. Used to send them the new invites list with their invite.
 * @param {Invite} invite - The invite to sdd
 * @param {number} [replyto] - The incoming websocket message ID, to include in the reply, if applicable
 */
function addInvite(ws, invite, replyto) {
	invites.push(invite);

	if (isInvitePublic(invite)) onPublicInvitesChange(ws, replyto);
	else sendClientInvitesList(ws, { replyto }); // Send them the new list after their invite creation!

	if (printNewInviteCreationsAndDeletions) {
		if (isInvitePrivate(invite)) console.log(`Created PRIVATE invite for user ${JSON.stringify(invite.owner)}`);
		else                         console.log(`Created invite for user ${JSON.stringify(invite.owner)}`);
	}
}

/**
 * Deletes an invite from the list of active invites.
 * Typically called when an invite is canceled. Sends the updated invites list to the socket.
 * @param {CustomWebSocket} ws - The socket of the player that canceled this invite. Used to send them the updated invites list.
 * @param {Invite} invite - The invite object to cancel. Contains details about the invite and its owner.
 * @param {number} index - The index of the invite in the invites array. This is found using {@link getInviteAndIndexByID}.
 * @param {Object} [options] - Optional parameters.
 * @param {boolean} [options.dontBroadcast=false] - If true, prevents broadcasting the changes to all clients.
 * @param {number} [options.replyto] - The incoming websocket message ID, to include in the reply, if applicable.
 * @returns {boolean} true if there was a public invite change
 */
function deleteInviteByIndex(ws, invite, index, { dontBroadcast, replyto } = {}) {
	if (index > invites.length - 1) return console.error(`Cannot delete invite of index ${index} when the length of our invites list is ${invites.length}!`);
	invites.splice(index, 1); // Delete the invite

	if (!dontBroadcast) {
		if (isInvitePublic(invite)) onPublicInvitesChange(ws, replyto);
		else sendClientInvitesList(ws, { replyto }); // Send them the new list after their invite cancellation!
	}

	if (printNewInviteCreationsAndDeletions) console.log(`Deleted invite for user ${JSON.stringify(invite.owner)}`);

	return isInvitePublic(invite); // true if a public invite changed
}

/**
 * Returns true if the provided socket is the owner of any active invites.
 * If so, they aren't allowed to create more.
 * @param {CustomWebSocket} ws 
 * @returns {boolean}
 */
function userHasInvite(ws) {
	for (const invite of invites) if (isInviteOurs(ws, invite)) return true;
	return false; // Player doesn't have an existing invite
}

/**
 * Tests if any active invite already has the ID provided.
 * This is used during generation of a unique invite id.
 * @param {string} id 
 * @returns {boolean} true if the ID is already in use, false if it's available
 */
function existingInviteHasID(id) {
	for (const invite of invites) if (invite.id === id) return true;
	return false;
}

/**
 * Finds an index by ID, and returns an object: `{ invite, index }`, otherwise undefined.
 * @param {number} id - The invite ID
 * @returns {Object | undefined} An object: `{ invite, index }`, or undefined if the invite wasn't found.
 */
function getInviteAndIndexByID(id) {
	for (let i = 0; i < invites.length; i++) {
		if (id === invites[i].id) return { invite: invites[i], index: i };
	}
}

//-------------------------------------------------------------------------------------------

/**
 * Returns the first socket subscribed to the invites list that matches the member/browser property.
 * Typically called when you need to inform a player their invite was accepted.
 * @returns {Socket | undefined} - The websocket, if found, otherwise undefined.
 */
function findSocketFromOwner(owner) { // { member/browser }
	// Iterate through all sockets, until you find one that matches the authentication of our invite owner
	const subscribedClients = getInviteSubscribers(); // { id: ws }
	if (owner.member) {
		for (const ws of Object.values(subscribedClients)) {
			if (ws.metadata.memberInfo.username === owner.member) return ws;
		}
	} else if (owner.browser) {
		for (const ws of Object.values(subscribedClients)) {
			if (ws.metadata.cookies['browser-id'] === owner.browser) return ws;
		}
	} else return console.error(`Cannot find socket from owner of invite when owner does not have a member nor browser property! Owner: ${JSON.stringify(owner)}`);

	console.log(`Unable to find a socket subbed to the invites list that belongs to ${JSON.stringify(owner)}!`);
}

/**
 * Subscribes a socket to the invites subscription list,
 * sends them the list of active invites,
 * and cancels any active timers to delete their invites if
 * their socket was previously closed by a network interruption.
 * @param {CustomWebSocket} ws 
 */
function subToInvitesList(ws) { // data: { route, action, value, id }
	if (ws.metadata.subscriptions.invites) return console.log(`CANNOT double-subscribe this socket to the invites list!! They should not have requested this! Metadata: ${socketUtility.stringifySocketMetadata(ws)}`);
	// if (ws.metadata.subscriptions.invites) return; // Already subscribed

	addSocketToInvitesSubs(ws);
	sendClientInvitesList(ws);
	cancelTimerToDeleteUsersInvitesFromNetworkInterruption(ws);
}

// Set closureNotByChoice to true if you don't immediately want to delete their invite, but say after 5 seconds.
function unsubFromInvitesList(ws, closureNotByChoice) { // data: { route, action, value, id }
	removeSocketFromInvitesSubs(ws);

	const { signedIn, identifier } = socketUtility.getSignedInAndIdentifierOfSocket(ws);

	if (!closureNotByChoice) return deleteUserInvitesIfNotConnected(signedIn, identifier); // Delete their existing invites
		

	// The closure WASN'T by choice! Set a 5s timer to give them time to reconnect before deleting their invite!
	console.log("Setting a 5-second timer to delete a user's invites!");

	const timersToUse = signedIn ? timersMember : timersBrowser;
	timersToUse[identifier] = setTimeout(deleteUserInvitesIfNotConnected, cushionToDisconnectMillis, signedIn, identifier);
}

/**
 * Cancels any running timers to delete a users invites from a network interruption.
 * @param {CustomWebSocket} ws - The socket of the new invite subscriber
 */
function cancelTimerToDeleteUsersInvitesFromNetworkInterruption(ws) {
	if (ws.metadata.memberInfo.signedIn) {
		clearTimeout(timersMember[ws.metadata.memberInfo.username]);
		delete timersMember[ws.metadata.memberInfo.username];
	} else if (ws.metadata.cookies['browser-id']) {
		clearTimeout(timersBrowser[ws.metadata.cookies['browser-id']]);
		delete timersBrowser[ws.metadata.cookies['browser-id']];
	}
}

//-------------------------------------------------------------------------------------------
  
/**
 * Deletes the invite associated with a specific member or browser ID, 
 * but only if they don't have an active connection.
 * If the invite belongs to a signed-in member, checks username; 
 * otherwise, it checks the browser ID.
 * If any public invite is deleted, it broadcasts the new invites list to all subscribers.
 * @param {boolean} signedIn - Flag to specify if the invite is for a signed-in member (true) or for a browser ID (false)
 * @param {string} identifier - The identifier of the member or browser (username for signed-in members, browser ID for non-signed-in users)
 */
function deleteUserInvitesIfNotConnected(signedIn, identifier) {
	// Don't delete invite if there is an active connection
	const hasActiveConnection = doesUserHaveActiveConnection(signedIn, identifier);
	if (hasActiveConnection) return console.log(`${signedIn ? `Member "${identifier}"` : `Browser "${identifier}"`} is still connected, not deleting invite.`);

	// Proceed with deleting the invite if not connected
	deleteUsersExistingInvite(signedIn, identifier);
}

/**
 * Deletes the invite associated with a specific member or browser ID.
 * If any public invite is deleted, it optionally broadcasts the new invites list to all subscribers.
 * @param {boolean} signedIn - Flag to specify if the invite is for a signed-in member (true) or for a browser ID (false)
 * @param {string} identifier - The identifier of the member or browser (username for signed-in members, browser ID for non-signed-in users)
 * @param {Object} [options] - Optional configuration object.
 * @param {boolean} [options.broadCastNewInvites=true] - Flag to specify whether to broadcast the new invites list after deleting (defaults to true).
 * @returns {boolean} - Returns true if any public invite was deleted, otherwise false.
 */
function deleteUsersExistingInvite(signedIn, identifier, { broadCastNewInvites = true } = {}) {
	let deletedPublicInvite = false;
	for (let i = invites.length - 1; i >= 0; i--) {
		const invite = invites[i];
		if (!isInviteOursByIdentifier(signedIn, identifier, invite)) continue;
		// Match! Delete
		invites.splice(i, 1); // Delete the invite
		if (isInvitePublic(invite)) deletedPublicInvite = true;
		console.log(`${signedIn ? `Deleted member's invite` : `Deleted browser's invite`}. ${signedIn ? `Username: "${identifier}"` : `Browser: "${identifier}"`}`);
	}

	if (deletedPublicInvite && broadCastNewInvites) onPublicInvitesChange(); // Broadcast the change if a public invite was deleted
	return deletedPublicInvite;
}



//-------------------------------------------------------------------------------------------

export {
	subToInvitesList,
	unsubFromInvitesList,
	existingInviteHasID,
	userHasInvite,
	addInvite,
	deleteInviteByIndex,
	getInviteAndIndexByID,
	deleteUsersExistingInvite,
	findSocketFromOwner,
	onPublicInvitesChange,
	IDLengthOfInvites
};