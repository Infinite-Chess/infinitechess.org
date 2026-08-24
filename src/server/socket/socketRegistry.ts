// src/server/socket/socketRegistry.ts

/**
 * This script stores all open websockets organized by ID, IP, and session.
 *
 * This contains methods for terminating all websockets by given criteria,
 * and rate limiting the socket count per user.
 */

import type { ClosureReason } from '../../shared/util/socketutil.js';
import type { CustomWebSocket } from './socketTypes.js';

import uuid from '../../shared/util/uuid.js';
import socketutil from '../../shared/util/socketutil.js';

import { ID_LENGTH } from '../utility/requestContext.js';

// Constants ----------------------------------------------------------------------------------

const MAX_SOCKETS_ALLOWED_PER_IP = 10;
const MAX_SOCKETS_ALLOWED_PER_SESSION = 5;

/**
 * The maximum age a websocket connection will live before auto terminating, in milliseconds.
 * Users have to provide authentication whenever they open a new socket.
 */
const MAX_WEBSOCKET_AGE_MILLIS = 1000 * 60 * 15; // 15 minutes.

// State --------------------------------------------------------------------------------------

/** All active websocket connections, keyed by their socket ID. */
const websocketConnections: { [id: string]: CustomWebSocket } = {};
/** Open socket ID's per IP address. */
const connectedIPs: { [IP: string]: string[] } = {};
/** Open socket ID's per session token. */
const connectedSessions: { [jwt: string]: string[] } = {};
/** Open socket ID's per member user ID. */
const connectedMembers: { [user_id: string]: string[] } = {};

// Adding / Removing from the lists -----------------------------------------------------------

/** Adds a websocket to all the tracking lists, and arms its expiry timer. */
function add(ws: CustomWebSocket): void {
	websocketConnections[ws.metadata.id] = ws;
	addConnectionToList(connectedIPs, ws.metadata.IP, ws.metadata.id); // Add IP connection
	if (ws.metadata.cookies.jwt)
		addConnectionToList(connectedSessions, ws.metadata.cookies.jwt, ws.metadata.id); // Add session connection
	if (ws.metadata.memberInfo.signedIn)
		addConnectionToList(connectedMembers, ws.metadata.memberInfo.user_id, ws.metadata.id); // Add user connection

	startTimerToExpireSocket(ws);
}

/** Removes a websocket from all the tracking lists, and cancels its expiry timer. */
function remove(ws: CustomWebSocket): void {
	delete websocketConnections[ws.metadata.id];
	removeConnectionFromList(connectedIPs, ws.metadata.IP, ws.metadata.id); // Remove IP connection
	if (ws.metadata.cookies.jwt)
		removeConnectionFromList(connectedSessions, ws.metadata.cookies.jwt, ws.metadata.id); // Remove session connection
	if (ws.metadata.memberInfo.signedIn)
		removeConnectionFromList(connectedMembers, ws.metadata.memberInfo.user_id, ws.metadata.id); // Remove member connection

	clearTimeout(ws.metadata.clearafter); // Cancel the timer to auto delete it at the end of its life
}

/** Adds a socket ID to the specified collection under the provided key. */
function addConnectionToList(
	collection: { [key: string]: string[] },
	key: number | string,
	id: string,
): void {
	if (!collection[key]) collection[key] = []; // Initialize the array if it doesn't exist
	collection[key].push(id);
}

/** Removes a socket ID from the specified collection under the provided key. */
function removeConnectionFromList(
	collection: { [key: string]: string[] },
	key: string | number,
	id: string,
): void {
	if (key === undefined || !collection[key]) return; // No key or collection doesn't exist
	const index = collection[key].indexOf(id);
	if (index !== -1) {
		collection[key].splice(index, 1);
		// Clean up if no connections left
		if (collection[key].length === 0) delete collection[key];
	}
}

/** Arms the timer that closes the socket when it reaches its maximum age. */
function startTimerToExpireSocket(ws: CustomWebSocket): void {
	ws.metadata.clearafter = setTimeout(
		() => ws.close(1000, socketutil.ClosureReasons.CONNECTION_EXPIRED),
		MAX_WEBSOCKET_AGE_MILLIS,
	); // We pass in an arrow function so it doesn't lose scope of ws.
}

// Terminating all sockets of criteria --------------------------------------------------------

/** Closes every socket connected from the given IP address. */
function terminateAllOfIP(IP: string): void {
	const connectionList = connectedIPs[IP];
	if (connectionList === undefined) return; // They don't have any sockets to terminate!
	for (const id of connectionList) {
		const ws = websocketConnections[id];
		ws?.close(1009, socketutil.ClosureReasons.TOO_MANY_REQUESTS);
	}
}

/** Closes all sockets a given member has open. */
function closeAllOfSession(jwt: string, closureCode: number, closureReason: ClosureReason): void {
	closeAllSocketsInList(connectedSessions[jwt], closureCode, closureReason);
}

/** Closes all sockets associated with a given user ID. */
function closeAllOfMember(
	user_id: number,
	closureCode: number,
	closureReason: ClosureReason,
): void {
	closeAllSocketsInList(connectedMembers[user_id], closureCode, closureReason);
}

/** Closes every socket in the ID list. `slice()` copies it first, as closing mutates the list. */
function closeAllSocketsInList(
	socketIDs: string[] | undefined,
	closureCode: number,
	closureReason: ClosureReason,
): void {
	socketIDs?.slice().forEach((socketID) => {
		const ws = websocketConnections[socketID];
		if (ws) ws.close(closureCode, closureReason);
	});
}

// Limiting the socket count per user ---------------------------------------------------------

/** Returns true if the given IP has the maximum number of websockets opened. */
function doesClientHaveMaxCount(IP: string): boolean {
	if (connectedIPs[IP] === undefined) return false;
	return connectedIPs[IP].length >= MAX_SOCKETS_ALLOWED_PER_IP;
}

/** Returns true if the given session has the maximum number of websockets opened. */
function doesSessionHaveMaxCount(jwt: string): boolean {
	if (connectedSessions[jwt] === undefined) return false;
	return connectedSessions[jwt].length >= MAX_SOCKETS_ALLOWED_PER_SESSION;
}

// Miscellaneous ------------------------------------------------------------------------------

/** Generates a unique socket ID. */
function generateUniqueID(): string {
	return uuid.genUniqueID(ID_LENGTH, websocketConnections); // Matches request IDs' length
}

// Exports ------------------------------------------------------------------------------------

export default {
	// Adding / Removing
	add,
	remove,
	// Terminating all sockets of criteria
	terminateAllOfIP,
	closeAllOfSession,
	closeAllOfMember,
	// Limiting the socket count
	doesClientHaveMaxCount,
	doesSessionHaveMaxCount,
	// Miscellaneous
	generateUniqueID,
};
