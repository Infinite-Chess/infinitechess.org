// src/server/game/invitesmanager/invitesmanager.ts

/**
 * This script manages our list of all active invites,
 * subscribes and unsubs sockets to and from the invites
 * subscription list,
 * and broadcasts changes out to the clients.
 */

import type { AuthMemberInfo } from '../../types.js';
import type { CustomWebSocket } from '../../socket/socketUtility.js';
import type { SafeInvite, Invite } from './inviteutility.js';

import jsutil from '../../../shared/util/jsutil.js';

import socketUtility from '../../socket/socketUtility.js';
import { sendSocketMessage } from '../../socket/sendSocketMessage.js';
import { getActiveGameCount } from '../gamemanager/gamecount.js';
import {
	isInvitePrivate,
	safelyCopyInvite,
	isInvitePublic,
	memberInfoEq,
} from './inviteutility.js';
import {
	getInviteSubscribers,
	addSocketToInvitesSubs,
	removeSocketFromInvitesSubs,
	doesUserHaveActiveConnection,
} from './invitessubscribers.js';

//-------------------------------------------------------------------------------------------

/** Whether to log new invite creations/deletions to the console */
const printNewInviteCreationsAndDeletions = true;

/** The number of digits generated invite IDs are. */
const IDLengthOfInvites = 5;

/** The list of all active invites, including private ones. */
const invites: Invite[] = [];

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
const timersMember: Record<number, ReturnType<typeof setTimeout>> = {};
/**
 * An object containing browser-ids for the keys, and setTimeout timer ID's for the values,
 * that represent the timers that are currently active to delete all a browser's invites
 * since they've disconnected.
 */
const timersBrowser: Record<string, ReturnType<typeof setTimeout>> = {};

//-------------------------------------------------------------------------------------------

/**
 * Gets the list of public invites with sensitive information REMOVED (such as browser-ids)
 * DOES NOT include private invites, not even your own, ADD THOSE SEPARATELY.
 */
function getPublicInvitesListSafe(): SafeInvite[] {
	const deepCopiedInvites: SafeInvite[] = [];

	for (const invite of invites) {
		if (isInvitePrivate(invite)) continue; // Remove private invites
		deepCopiedInvites.push(safelyCopyInvite(invite)); // Remove sensitive information
	}

	return deepCopiedInvites;
}

/**
 * Adds any private invite that belongs to the socket to the provided invites list.
 * @param ws
 * @param copyOfInvitesList - A copy of the invites list, so we don't modify the original
 */
function addMyPrivateInviteToList(
	ws: CustomWebSocket,
	copyOfInvitesList: SafeInvite[],
): SafeInvite[] {
	for (const invite of invites) {
		if (isInvitePublic(invite)) continue; // Next invite, this one isn't private
		if (!memberInfoEq(ws.metadata.memberInfo, invite.owner)) continue; // Doesn't belong to us
		const inviteSafeCopy = safelyCopyInvite(invite); // Makes a deep copy and removes sensitive information
		copyOfInvitesList.push(inviteSafeCopy);
	}
	return copyOfInvitesList;
}

// When a PUBLIC invite is added or removed..

/**
 * Call when a public invite is added or deleted.
 * @param ws - The websocket that trigerred this public invites change.
 * @param replyto - The ID of the incoming websocket message that triggered this method
 */
function onPublicInvitesChange(ws?: CustomWebSocket, replyto?: number): void {
	// The message that this broadcast is the reply to
	broadcastInvites(ws, replyto);
}

/**
 * Broadcasts the invites list out to all subbed clients.
 * @param ws - The websocket that trigerred this broadcast. Used to include the replyto id for ONLY THEIR message.
 * @param replyto - The ID of the incoming websocket message that triggered this broadcast
 */
function broadcastInvites(ws?: CustomWebSocket, replyto?: number): void {
	const newInvitesList = getPublicInvitesListSafe();
	const currentGameCount = getActiveGameCount();

	const subscribedClients = getInviteSubscribers() as Record<string, CustomWebSocket>;
	for (const subbedSocket of Object.values(subscribedClients)) {
		const newInvitesListCopy = jsutil.deepCopyObject(newInvitesList);
		// Only include the replyto code with the invite list if this socket is
		// THE SAME SOCKET as the one that triggered this broadcast.
		const includedReplyTo = ws === subbedSocket ? replyto : undefined;
		sendClientInvitesList(subbedSocket, {
			invitesList: newInvitesListCopy,
			currentGameCount,
			replyto: includedReplyTo,
		});
	}
}

/**
 * Sends the invites list to a specified socket, including any private invites the player owns,
 * and also sends the current active game count.
 * @param ws - The socket of the player to send the invites list to.
 * @param options.invitesList - The list of invites to send. Defaults to the public invites list if not provided. [getPublicInvitesListSafe()]
 * @param options.currentGameCount - The current active game count. Defaults to the current game count if not provided. [getActiveGameCount()]
 * @param options.replyto - The incoming websocket message ID, to include in the reply, if applicable.
 */
function sendClientInvitesList(
	ws: CustomWebSocket,
	{
		invitesList = getPublicInvitesListSafe(),
		currentGameCount = getActiveGameCount(),
		replyto = undefined,
	}: { replyto?: number; invitesList?: SafeInvite[]; currentGameCount?: number } = {},
): void {
	invitesList = addMyPrivateInviteToList(ws, invitesList);
	const message = { invitesList, currentGameCount };
	sendSocketMessage(ws, 'invites', 'inviteslist', message, replyto); // In order: socket, sub, action, value
}

/**
 * Adds a new invite to the list of active invites.
 * Typically called when an invite is created. Sends the new invites list to the socket.
 * @param ws - The socket of the player that created this invite. Used to send them the new invites list with their invite.
 * @param invite - The invite to sdd
 * @param replyto - The incoming websocket message ID, to include in the reply, if applicable
 */
function addInvite(ws: CustomWebSocket, invite: Invite, replyto?: number): void {
	invites.push(invite);

	if (isInvitePublic(invite)) onPublicInvitesChange(ws, replyto);
	else sendClientInvitesList(ws, { replyto }); // Send them the new list after their invite creation!

	if (printNewInviteCreationsAndDeletions) {
		if (isInvitePrivate(invite))
			console.log(`Created PRIVATE invite for user ${JSON.stringify(invite.owner)}`);
		else console.log(`Created invite for user ${JSON.stringify(invite.owner)}`);
	}
}

/**
 * Deletes an invite from the list of active invites.
 * Typically called when an invite is canceled. Sends the updated invites list to the socket.
 * @param ws - The socket of the player that canceled this invite. Used to send them the updated invites list.
 * @param invite - The invite object to cancel. Contains details about the invite and its owner.
 * @param index - The index of the invite in the invites array. This is found using {@link getInviteAndIndexByID}.
 * @param options.dontBroadcast - If true, prevents broadcasting the changes to all clients. [false]
 * @param options.replyto - The incoming websocket message ID, to include in the reply, if applicable.
 * @returns true if there was a public invite change
 */
function deleteInviteByIndex(
	ws: CustomWebSocket,
	invite: Invite,
	index: number,
	{
		dontBroadcast = false,
		replyto = undefined,
	}: { dontBroadcast?: boolean; replyto?: number } = {},
): boolean {
	if (index > invites.length - 1) {
		console.error(
			`Cannot delete invite of index ${index} when the length of our invites list is ${invites.length}!`,
		);
		return false; // No public invite change
	}
	invites.splice(index, 1); // Delete the invite

	if (!dontBroadcast) {
		if (isInvitePublic(invite)) onPublicInvitesChange(ws, replyto);
		else sendClientInvitesList(ws, { replyto }); // Send them the new list after their invite cancellation!
	}

	if (printNewInviteCreationsAndDeletions)
		console.log(`Deleted invite for user ${JSON.stringify(invite.owner)}`);

	return isInvitePublic(invite); // true if a public invite changed
}

/**
 * Returns true if the provided socket is the owner of any active invites.
 * If so, they aren't allowed to create more.
 */
function userHasInvite(ws: CustomWebSocket): boolean {
	for (const invite of invites)
		if (memberInfoEq(ws.metadata.memberInfo, invite.owner)) return true;
	return false; // Player doesn't have an existing invite
}

/**
 * Tests if any active invite already has the ID provided.
 * This is used during generation of a unique invite id.
 * @returns true if the ID is already in use, false if it's available
 */
function existingInviteHasID(id: string): boolean {
	for (const invite of invites) if (invite.id === id) return true;
	return false;
}

/**
 * Finds an index by ID, and returns an object: `{ invite, index }`, otherwise undefined.
 * @param id - The invite ID
 * @returns An object: `{ invite, index }`, or undefined if the invite wasn't found.
 */
function getInviteAndIndexByID(id: string): { invite: Invite; index: number } | undefined {
	for (let i = 0; i < invites.length; i++) {
		if (id === invites[i]!.id) return { invite: invites[i]!, index: i };
	}
	return undefined;
}

//-------------------------------------------------------------------------------------------

/**
 * Returns the first socket subscribed to the invites list that matches the member/browser property.
 * Typically called when you need to inform a player their invite was accepted.
 * @returns The websocket, if found, otherwise undefined.
 */
function findSocketFromOwner(owner: AuthMemberInfo): CustomWebSocket | undefined {
	// { member/browser }
	// Iterate through all sockets, until you find one that matches the authentication of our invite owner
	const subscribedClients = getInviteSubscribers(); // { id: ws }
	for (const ws of Object.values(subscribedClients)) {
		if (memberInfoEq(owner, ws.metadata.memberInfo)) return ws;
	}

	console.log(
		`Unable to find a socket subbed to the invites list that belongs to ${JSON.stringify(owner)}!`,
	);
	return undefined;
}

/**
 * Subscribes a socket to the invites subscription list,
 * sends them the list of active invites,
 * and cancels any active timers to delete their invites if
 * their socket was previously closed by a network interruption.
 */
function subToInvitesList(ws: CustomWebSocket): void {
	// data: { route, action, value, id }
	if (ws.metadata.subscriptions.invites)
		return console.log(
			`CANNOT double-subscribe this socket to the invites list!! They should not have requested this! Metadata: ${socketUtility.stringifySocketMetadata(ws)}`,
		);
	// if (ws.metadata.subscriptions.invites) return; // Already subscribed

	addSocketToInvitesSubs(ws);
	sendClientInvitesList(ws);
	cancelTimerToDeleteUsersInvitesFromNetworkInterruption(ws);
}

// Set closureNotByChoice to true if you don't immediately want to delete their invite, but say after 5 seconds.
function unsubFromInvitesList(ws: CustomWebSocket, closureNotByChoice?: boolean): void {
	// data: { route, action, value, id }
	removeSocketFromInvitesSubs(ws);

	const owner = ws.metadata.memberInfo;

	if (!closureNotByChoice) return deleteUserInvitesIfNotConnected(owner); // Delete their existing invites

	// The closure WASN'T by choice! Set a 5s timer to give them time to reconnect before deleting their invite!
	// console.log("Setting a 5-second timer to delete a user's invites!");
	const timeout = setTimeout(deleteUserInvitesIfNotConnected, cushionToDisconnectMillis, owner);
	if (owner.signedIn) timersMember[owner.user_id] = timeout;
	else timersBrowser[owner.browser_id] = timeout;
}

/**
 * Cancels any running timers to delete a users invites from a network interruption.
 * @param ws - The socket of the new invite subscriber
 */
function cancelTimerToDeleteUsersInvitesFromNetworkInterruption(ws: CustomWebSocket): void {
	if (ws.metadata.memberInfo.signedIn) {
		clearTimeout(timersMember[ws.metadata.memberInfo.user_id]);
		delete timersMember[ws.metadata.memberInfo.user_id];
	} else if (ws.metadata) {
		clearTimeout(timersBrowser[ws.metadata.memberInfo.browser_id]);
		delete timersBrowser[ws.metadata.memberInfo.browser_id];
	}
}

//-------------------------------------------------------------------------------------------

/**
 * Deletes the invite associated with a specific member or browser ID,
 * but only if they don't have an active connection.
 * If the invite belongs to a signed-in member, checks username;
 * otherwise, it checks the browser ID.
 * If any public invite is deleted, it broadcasts the new invites list to all subscribers.
 * @param signedIn - Flag to specify if the invite is for a signed-in member (true) or for a browser ID (false)
 * @param identifier - The identifier of the member or browser (username for signed-in members, browser ID for non-signed-in users)
 */
function deleteUserInvitesIfNotConnected(info: AuthMemberInfo): void {
	// Don't delete invite if there is an active connection
	const hasActiveConnection = doesUserHaveActiveConnection(info);
	if (hasActiveConnection) {
		// console.log(`${signedIn ? `Member "${identifier}"` : `Browser "${identifier}"`} is still connected, not deleting invite.`);
		return;
	}

	// Proceed with deleting the invite if not connected
	deleteUsersExistingInvite(info);
}

/**
 * Deletes the invite associated with a specific member or browser ID.
 * If any public invite is deleted, it optionally broadcasts the new invites list to all subscribers.
 * @param info The info related to a user
 * @param options.broadCastNewInvites - Flag to specify whether to broadcast the new invites list after deleting (defaults to true). [true]
 * @returns Returns true if any public invite was deleted, otherwise false.
 */
function deleteUsersExistingInvite(
	info: AuthMemberInfo,
	{ broadCastNewInvites = true } = {},
): boolean {
	let deletedPublicInvite = false;
	for (let i = invites.length - 1; i >= 0; i--) {
		const invite = invites[i]!;
		if (!memberInfoEq(info, invite.owner)) continue;
		// Match! Delete
		invites.splice(i, 1); // Delete the invite
		if (isInvitePublic(invite)) deletedPublicInvite = true;
		console.log(
			`${info.signedIn ? `Deleted member's invite. Username: ${info.username}` : `Deleted browser's invite. Browser: ${info.browser_id}`}`,
		);
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
	IDLengthOfInvites,
};
