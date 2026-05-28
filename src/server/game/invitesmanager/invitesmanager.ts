// src/server/game/invitesmanager/invitesmanager.ts

/**
 * This script manages our list of all active invites,
 * subscribes and unsubs sockets to and from the invites
 * subscription list,
 * and broadcasts changes out to the clients.
 */

import type { OutSeek } from '../../../shared/types.js';
import type { AuthMemberInfo } from '../../types.js';
import type { CustomWebSocket } from '../../socket/socketUtility.js';

import { IDLengthOfInvites } from '../../../shared/types.js';

import { sendSocketMessage } from '../../socket/sendSocketMessage.js';
import { safelyCopyInvite, memberInfoEq, AuthSeek } from './inviteutility.js';
import {
	getInviteSubscribers,
	addSocketToInvitesSubs,
	removeSocketFromInvitesSubs,
	doesUserHaveActiveConnection,
} from './invitessubscribers.js';

//-------------------------------------------------------------------------------------------

/** Whether to log new invite creations/deletions to the console */
const printNewInviteCreationsAndDeletions = true;

/** The list of all active invites. */
const invites: AuthSeek[] = [];

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

/** Gets the list of invites with sensitive information REMOVED (such as browser-ids) */
function getInvitesListSafe(): OutSeek[] {
	const deepCopiedInvites: OutSeek[] = [];

	for (const invite of invites) {
		deepCopiedInvites.push(safelyCopyInvite(invite)); // Remove sensitive information
	}

	return deepCopiedInvites;
}

// When a PUBLIC invite is added or removed..

/**
 * Call when an invite is added or deleted.
 */
function onPublicInvitesChange(): void {
	// The message that this broadcast is the reply to
	broadcastInvites();
}

/**
 * Broadcasts the invites list out to all subbed clients.
 */
function broadcastInvites(): void {
	const newInvitesList = getInvitesListSafe();
	// TODO: Track the viewer count (number of unique sockets subbed to the invites list)

	const subscribedClients = getInviteSubscribers() as Record<string, CustomWebSocket>;
	for (const subbedSocket of Object.values(subscribedClients)) {
		sendClientInvitesList(subbedSocket, newInvitesList);
	}
}

/**
 * Sends the invites list to a specified socket.
 * @param ws - The socket of the player to send the invites list to.
 * @param invitesList - The list of invites to send.
 */
function sendClientInvitesList(ws: CustomWebSocket, invitesList: OutSeek[]): void {
	// TODO: Track the viewer count (number of unique sockets subbed to the invites list)
	const message = { invitesList, viewerCount: 0 };
	sendSocketMessage(ws, 'lobby', 'seekslist', message); // In order: socket, sub, action, value
}

/**
 * Adds a new invite to the list of active invites.
 * Typically called when an invite is created. Sends the new invites list to the socket.
 * @param invite - The invite to sdd
 */
function addInvite(invite: AuthSeek): void {
	invites.push(invite);

	onPublicInvitesChange();

	if (printNewInviteCreationsAndDeletions)
		console.log(`Created invite for user ${JSON.stringify(invite.owner)}`);
}

/**
 * Deletes an invite from the list of active invites.
 * Typically called when an invite is canceled. Sends the updated invites list to the socket.
 * @param seek - The invite object to cancel. Contains details about the invite and its owner.
 * @param index - The index of the invite in the invites array. This is found using {@link getInviteAndIndexByID}.
 * @param options.dontBroadcast - If true, prevents broadcasting the changes to all clients. [false]
 * @returns true if there was an invite change
 */
function deleteInviteByIndex(
	seek: AuthSeek,
	index: number,
	{ dontBroadcast = false }: { dontBroadcast?: boolean } = {},
): boolean {
	if (index > invites.length - 1) {
		console.error(
			`Cannot delete invite of index ${index} when the length of our invites list is ${invites.length}!`,
		);
		return false; // No invite change
	}
	invites.splice(index, 1); // Delete the invite

	if (!dontBroadcast) onPublicInvitesChange();

	if (printNewInviteCreationsAndDeletions)
		console.log(`Deleted invite for user ${JSON.stringify(seek.owner)}`);

	return true;
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
function getInviteAndIndexByID(id: string): { seek: AuthSeek; index: number } | undefined {
	for (let i = 0; i < invites.length; i++) {
		if (id === invites[i]!.id) return { seek: invites[i]!, index: i };
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
	if (ws.metadata.subscriptions.lobby) return; // Already subscribed. Happens occasionally

	addSocketToInvitesSubs(ws);
	sendClientInvitesList(ws, getInvitesListSafe());
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
 * If any invite is deleted, it broadcasts the new invites list to all subscribers.
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
 * If any invite is deleted, it optionally broadcasts the new invites list to all subscribers.
 * @param info The info related to a user
 * @param options.broadCastNewInvites - Flag to specify whether to broadcast the new invites list after deleting (defaults to true). [true]
 * @returns Returns true if any invite was deleted, otherwise false.
 */
function deleteUsersExistingInvite(
	info: AuthMemberInfo,
	{ broadCastNewInvites = true } = {},
): boolean {
	let deletedInvite = false;
	for (let i = invites.length - 1; i >= 0; i--) {
		const invite = invites[i]!;
		if (!memberInfoEq(info, invite.owner)) continue;
		// Match! Delete
		invites.splice(i, 1); // Delete the invite
		deletedInvite = true;
		if (printNewInviteCreationsAndDeletions)
			console.log(
				`${info.signedIn ? `Deleted member's invite. Username: ${info.username}` : `Deleted browser's invite. Browser: ${info.browser_id}`}`,
			);
	}

	if (deletedInvite && broadCastNewInvites) onPublicInvitesChange(); // Broadcast the change if an invite was deleted
	return deletedInvite;
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
