// src/server/game/seeksmanager/lobbymanager.ts

/**
 * This script manages our list of all active seeks,
 * subscribes and unsubs sockets to and from the lobby,
 * and broadcasts changes out to the clients.
 */

import type { OutSeek } from '../../../shared/types.js';
import type { AuthMemberInfo } from '../../types.js';
import type { CustomWebSocket } from '../../socket/socketUtility.js';

import { IDLengthOfSeeks } from '../../../shared/types.js';

import { sendSocketMessage } from '../../socket/sendSocketMessage.js';
import { safelyCopySeek, memberInfoEq, AuthSeek } from './seekutility.js';
import {
	getLobbySubscribers,
	getSubscriberCount,
	addSocketToLobbySubs,
	removeSocketFromLobbySubs,
	doesUserHaveActiveConnection,
} from './lobbysubscribers.js';

//-------------------------------------------------------------------------------------------

/** Whether to log new seek creations/deletions to the console */
const printNewSeekCreationsAndDeletions = true;

/** The list of all active seeks. */
const seeks: AuthSeek[] = [];

/**
 * Time to allow the client to reconnect after an UNEXPECTED (not purposeful)
 * socket closure before any seek of theirs is deleted!
 */
const cushionToDisconnectMillis = 5000; // 5 seconds

/**
 * An object containing usernames for the keys, and setTimeout timer ID's for the values,
 * that represent the timers that are currently active to delete all a player's seeks
 * since they've disconnected.
 */
const timersMember: Record<number, ReturnType<typeof setTimeout>> = {};
/**
 * An object containing browser-ids for the keys, and setTimeout timer ID's for the values,
 * that represent the timers that are currently active to delete all a browser's seeks
 * since they've disconnected.
 */
const timersBrowser: Record<string, ReturnType<typeof setTimeout>> = {};

//-------------------------------------------------------------------------------------------

/** Gets the list of seeks with sensitive information REMOVED (such as browser-ids) */
function getSeeksListSafe(): OutSeek[] {
	const deepCopiedSeeks: OutSeek[] = [];

	for (const seek of seeks) {
		deepCopiedSeeks.push(safelyCopySeek(seek)); // Remove sensitive information
	}

	return deepCopiedSeeks;
}

// When a PUBLIC seek is added or removed..

/**
 * Call when an seek is added or deleted.
 */
function onPublicSeeksChange(): void {
	// The message that this broadcast is the reply to
	broadcastSeeks();
}

/** Broadcasts a live seek list update to all subbed clients. */
function broadcastSeeks(): void {
	const seeksList = getSeeksListSafe();
	const message = { seeksList };
	for (const subbedSocket of getLobbySubscribers()) {
		sendSocketMessage(subbedSocket, 'lobby', 'seekslist', message);
	}
}

/**
 * Sends the full lobby snapshot state (seeks list + current viewer count) to a single client.
 * Called once when a socket first subscribes.
 * @param ws - The socket of the player to send the snapshot to.
 * @param seekslist - The current list of seeks.
 */
function sendClientLobbySnapshot(ws: CustomWebSocket, seekslist: OutSeek[]): void {
	const viewercount = getSubscriberCount();
	const message = { seekslist, viewercount };
	sendSocketMessage(ws, 'lobby', 'lobbysnapshot', message); // In order: socket, sub, action, value
}

/**
 * Broadcasts the current viewer count to all subscribed clients.
 * Called when the subscriber count changes (i.e. on sub/unsub), not on seek changes.
 * @param skipWs - Optional socket to exclude from the broadcast (e.g. the socket that just subscribed, who already received the count in their lobbysnapshot).
 */
function broadcastViewerCount(skipWs?: CustomWebSocket): void {
	const count = getSubscriberCount();
	for (const ws of getLobbySubscribers()) {
		if (ws === skipWs) continue;
		sendSocketMessage(ws, 'lobby', 'viewercount', count);
	}
}

/**
 * Adds a new seek to the list of active seeks.
 * Typically called when an seek is created. Sends the new seeks list to the socket.
 * @param seek - The seek to sdd
 */
function addSeek(seek: AuthSeek): void {
	seeks.push(seek);

	onPublicSeeksChange();

	if (printNewSeekCreationsAndDeletions)
		console.log(`Created seek for user ${JSON.stringify(seek.owner)}`);
}

/**
 * Deletes a seek from the list of active seeks.
 * Typically called when an seek is canceled. Sends the updated seeks list to the socket.
 * @param seek - The seek object to cancel. Contains details about the seek and its owner.
 * @param index - The index of the seek in the seeks array. This is found using {@link getSeekAndIndexByID}.
 * @param options.dontBroadcast - If true, prevents broadcasting the changes to all clients. [false]
 * @returns true if there was a seek change
 */
function deleteSeekByIndex(
	seek: AuthSeek,
	index: number,
	{ dontBroadcast = false }: { dontBroadcast?: boolean } = {},
): boolean {
	if (index > seeks.length - 1) {
		console.error(
			`Cannot delete seek of index ${index} when the length of our seeks list is ${seeks.length}!`,
		);
		return false; // No seek change
	}
	seeks.splice(index, 1); // Delete the seek

	if (!dontBroadcast) onPublicSeeksChange();

	if (printNewSeekCreationsAndDeletions)
		console.log(`Deleted seek for user ${JSON.stringify(seek.owner)}`);

	return true;
}

/**
 * Tests if any active seek already has the ID provided.
 * This is used during generation of a unique seek id.
 * @returns true if the ID is already in use, false if it's available
 */
function existingSeekHasID(id: string): boolean {
	for (const seek of seeks) if (seek.id === id) return true;
	return false;
}

/** Finds an index by ID, and returns an object: `{ seek, index }`, otherwise undefined. */
function getSeekAndIndexByID(id: string): { seek: AuthSeek; index: number } | undefined {
	for (let i = 0; i < seeks.length; i++) {
		if (id === seeks[i]!.id) return { seek: seeks[i]!, index: i };
	}
	return undefined;
}

//-------------------------------------------------------------------------------------------

/**
 * Returns the first socket subscribed to the seeks list that matches the member/browser property.
 * Typically called when you need to inform a player their seek was accepted.
 * @returns The websocket, if found, otherwise undefined.
 */
function findSocketFromOwner(owner: AuthMemberInfo): CustomWebSocket | undefined {
	// Iterate through all sockets, until you find one that matches the authentication of our seek owner
	for (const ws of getLobbySubscribers()) {
		if (memberInfoEq(owner, ws.metadata.memberInfo)) return ws;
	}

	console.log(`Unable to find a lobby subscriber that belongs to ${JSON.stringify(owner)}!`);
	return undefined;
}

/**
 * Subscribes a socket to the lobby,
 * sends them the list of active seeks,
 * and cancels any active timers to delete their seeks if
 * their socket was previously closed by a network interruption.
 */
function subToLobby(ws: CustomWebSocket): void {
	if (ws.metadata.subscriptions.lobby) return; // Already subscribed. Happens occasionally

	addSocketToLobbySubs(ws);
	sendClientLobbySnapshot(ws, getSeeksListSafe());
	broadcastViewerCount(ws); // Notify all existing subscribers of the incremented count
	cancelTimerToDeleteUsersSeeksFromNetworkInterruption(ws);
}

// Set closureNotByChoice to true if you don't immediately want to delete their seek, but say after 5 seconds.
function unsubFromLobby(ws: CustomWebSocket, closureNotByChoice?: boolean): void {
	// data: { route, action, value, id }
	removeSocketFromLobbySubs(ws);
	broadcastViewerCount(); // Notify remaining subscribers of the decremented count

	const owner = ws.metadata.memberInfo;

	if (!closureNotByChoice) return deleteUserSeeksIfNotConnected(owner); // Delete their existing seeks

	// The closure WASN'T by choice! Set a 5s timer to give them time to reconnect before deleting their seek!
	// console.log("Setting a 5-second timer to delete a user's seek!");
	const timeout = setTimeout(
		() => deleteUserSeeksIfNotConnected(owner),
		cushionToDisconnectMillis,
	);
	if (owner.signedIn) timersMember[owner.user_id] = timeout;
	else timersBrowser[owner.browser_id] = timeout;
}

/**
 * Cancels any running timers to delete a users seeks from a network interruption.
 * @param ws - The socket of the new seeks subscriber
 */
function cancelTimerToDeleteUsersSeeksFromNetworkInterruption(ws: CustomWebSocket): void {
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
 * Deletes the seek associated with a specific member or browser ID,
 * but only if they don't have an active connection.
 * If the seek belongs to a signed-in member, checks username;
 * otherwise, it checks the browser ID.
 * If any seek is deleted, it broadcasts the new seeks list to all subscribers.
 * @param signedIn - Flag to specify if the seek is for a signed-in member (true) or for a browser ID (false)
 * @param identifier - The identifier of the member or browser (username for signed-in members, browser ID for non-signed-in users)
 */
function deleteUserSeeksIfNotConnected(info: AuthMemberInfo): void {
	// Don't delete seek if there is an active connection
	const hasActiveConnection = doesUserHaveActiveConnection(info);
	if (hasActiveConnection) {
		// console.log(`${signedIn ? `Member "${identifier}"` : `Browser "${identifier}"`} is still connected, not deleting seek.`);
		return;
	}

	// Proceed with deleting the seek if not connected
	deleteUsersExistingSeek(info);
}

/**
 * Deletes the seek associated with a specific member or browser ID.
 * If any seek is deleted, it optionally broadcasts the new seeks list to all subscribers.
 * @param info The info related to a user
 * @param options.broadCastNewSeeks - Flag to specify whether to broadcast the new seeks list after deleting (defaults to true). [true]
 * @returns Returns true if any seek was deleted, otherwise false.
 */
function deleteUsersExistingSeek(info: AuthMemberInfo, { broadCastNewSeeks = true } = {}): boolean {
	let deletedSeek = false;
	for (let i = seeks.length - 1; i >= 0; i--) {
		const seek = seeks[i]!;
		if (!memberInfoEq(info, seek.owner)) continue;
		// Match! Delete
		seeks.splice(i, 1); // Delete the seek
		deletedSeek = true;
		if (printNewSeekCreationsAndDeletions)
			console.log(
				`${info.signedIn ? `Deleted member's seek. Username: ${info.username}` : `Deleted browser's seek. Browser: ${info.browser_id}`}`,
			);
	}

	if (deletedSeek && broadCastNewSeeks) onPublicSeeksChange(); // Broadcast the change if an seek was deleted
	return deletedSeek;
}

//-------------------------------------------------------------------------------------------

export {
	subToLobby,
	unsubFromLobby,
	existingSeekHasID,
	addSeek,
	deleteSeekByIndex,
	getSeekAndIndexByID,
	deleteUsersExistingSeek,
	findSocketFromOwner,
	onPublicSeeksChange,
	IDLengthOfSeeks,
};
