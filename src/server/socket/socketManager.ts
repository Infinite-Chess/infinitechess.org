
/**
 * This script stores all open websockets organized by ID, IP, and session.
 * 
 * This contains methods for terminating all websockets by given criteria,
 * Rate limiting the socket count per user,
 * And unsubbing a socket from subscriptions.
 */

import socketUtility from "./socketUtility.js";
import { sendSocketMessage } from "./sendSocketMessage.js";
import uuid from "../../client/scripts/esm/util/uuid.js";
// @ts-ignore
import { printIncomingAndClosingSockets } from "../config/config.js";
// @ts-ignore
import { unsubFromInvitesList } from "../game/invitesmanager/invitesmanager.js";
// @ts-ignore
import { unsubClientFromGameBySocket } from "../game/gamemanager/gamemanager.js";


// Type Definitions ---------------------------------------------------------------------------


import type { CustomWebSocket } from "./socketUtility.js";


// Variables ---------------------------------------------------------------------------


/**
 * An object containing all active websocket connections, with their ID's for the keys: `{ 21: websocket }`
 */
const websocketConnections: { [id: string]: CustomWebSocket } = {}; // Object containing all active web socket connections, with their ID's for the KEY
/**
 * An object with IP addresses for the keys, and arrays of their
 * socket id's they have open for the value: `{ "83.28.68.253": ['fighe26'] }`
 */
const connectedIPs: { [IP: string]: string[] } = {}; // Keys are the IP. Values are array lists containing all connection IDs they have going.
/**
 * An object with refresh tokens for the keys, and arrays of their
 * socket id's they have open for the value: `{ uHrU85835...: ['fighe26'] }`
 */
const connectedSessions: { [username: string]: string[] } = {};

/**
 * A mapping of user IDs to arrays of socket IDs representing their active WebSocket connections.
 */
const connectedMembers: { [user_id: string]: string[] } = {};

const maxSocketsAllowedPerIP = 10;
const maxSocketsAllowedPerSession = 5;

/**
 * The maximum age a websocket connection will live before auto terminating, in milliseconds.
 * Users have to provide authentication whenever they open a new socket.
 */
const maxWebSocketAgeMillis = 1000 * 60 * 15; // 15 minutes. 
// const maxWebSocketAgeMillis = 1000 * 10; // 10 seconds for dev testing


// Adding / Removing from the lists ---------------------------------------------------------------------------


function addConnectionToConnectionLists(ws: CustomWebSocket) {
	websocketConnections[ws.metadata.id] = ws;
	addConnectionToList(connectedIPs, ws.metadata.IP, ws.metadata.id); // Add IP connection
	addConnectionToList(connectedSessions, ws.metadata.cookies.jwt, ws.metadata.id); // Add session connection
	addConnectionToList(connectedMembers, ws.metadata.memberInfo.user_id, ws.metadata.id); // Add user connection

	startTimerToExpireSocket(ws);
	if (printIncomingAndClosingSockets) console.log(`New WebSocket connection established. Socket count: ${Object.keys(websocketConnections).length}. Metadata: ${socketUtility.stringifySocketMetadata(ws)}`);
}

/**
 * Adds a socket ID to the specified collection under the provided key.
 * @param collection - The collection (e.g., connectedIPs, connectedSessions, etc.)
 * @param key - The key in the collection (e.g., IP, session ID, user ID)
 * @param id - The socket ID to add to the collection.
 */
function addConnectionToList(collection: { [key: string]: string[] }, key: number | string | undefined, id: string) {
	if (key === undefined) return; // No key, no operation
	if (!collection[key]) collection[key] = []; // Initialize the array if it doesn't exist
	collection[key].push(id); // Add the socket ID to the list
}

function startTimerToExpireSocket(ws: CustomWebSocket) {
	ws.metadata.clearafter = setTimeout(() => ws.close(1000, 'Connection expired'), maxWebSocketAgeMillis); // We pass in an arrow function so it doesn't lose scope of ws.
}

/**
 * Removes the given WebSocket connection from all tracking lists.
 * @param ws - The WebSocket connection to remove.
 * @param code - The WebSocket closure code.
 * @param reason - The reason for the WebSocket closure.
 */
function removeConnectionFromConnectionLists(ws: CustomWebSocket, code: number, reason: string) {
	delete websocketConnections[ws.metadata.id];
	removeConnectionFromList(connectedIPs, ws.metadata.IP, ws.metadata.id); // Remove IP connection
	removeConnectionFromList(connectedSessions, ws.metadata.cookies.jwt, ws.metadata.id); // Remove session connection
	removeConnectionFromList(connectedMembers, ws.metadata.memberInfo.user_id, ws.metadata.id); // Remove member connection

	clearTimeout(ws.metadata.clearafter); // Cancel the timer to auto delete it at the end of its life
	if (printIncomingAndClosingSockets) console.log(`WebSocket connection has been closed. Code: ${code}. Reason: ${reason}. Socket count: ${Object.keys(websocketConnections).length}`);
}

/**
 * Removes a socket ID from the specified collection under the provided key.
 * @param collection - The collection (e.g., connectedIPs, connectedSessions, etc.)
 * @param key - The key in the collection (e.g., IP, session ID, user ID)
 * @param id - The socket ID to remove from the collection.
 */
function removeConnectionFromList(collection: { [key: string]: string[] }, key: string | number | undefined, id: string) {
	if (key === undefined || !collection[key]) return; // No key or collection doesn't exist
	const index = collection[key].indexOf(id);
	if (index !== -1) {
		collection[key].splice(index, 1); // Remove the socket ID from the list
		// Clean up if no connections left
		if (collection[key].length === 0) delete collection[key];
	}
}


// Terminating all sockets of criteria ---------------------------------------------------------------------------


function terminateAllIPSockets(IP: string) {
	const connectionList = connectedIPs[IP];
	if (connectionList === undefined) return; // IP is defined, but they don't have any sockets to terminate!
	for (const id of connectionList) {
		//console.log(`Terminating 1.. id ${id}`)
		const ws = websocketConnections[id];
		ws?.close(1009, 'Message Too Big');
	}

	// console.log(`Terminated all of IP ${IP}`)
	// console.log(connectedIPs) // This will still be full because they aren't actually spliced out of their list until the close() is complete!
}

/**
 * Closes all sockets a given member has open.
 * @param jwt - The member's session/refresh token, if they are signed in.
 * @param closureCode - The code of the socket closure, sent to the client.
 * @param closureReason - The closure reason, sent to the client.
 */
function closeAllSocketsOfSession(jwt: string, closureCode: number, closureReason: string) {
	connectedSessions[jwt]?.slice().forEach(socketID => { // slice() makes a copy of it
		const ws = websocketConnections[socketID];
		if (!ws) return;
		ws.close(closureCode, closureReason);
	});
}

/**
 * Closes all sockets associated with a given user ID.
 * @param user_id - The unique ID of the user.
 * @param closureCode - The code for closing the socket, sent to the client.
 * @param closureReason - The reason for closure, sent to the client.
 */
function closeAllSocketsOfMember(user_id: string, closureCode: number, closureReason: string) {
	const socketIDs = connectedMembers[user_id];
	if (!socketIDs) return; // This member doesn't have any connected sockets

	socketIDs.slice().forEach(socketID => { // slice() makes a copy of it
		const ws = websocketConnections[socketID];
		if (!ws) return;
		ws.close(closureCode, closureReason);
	});
}

/**
 * Sets the metadata.verified entry of all sockets of a given user to true.
 * @param user_id - The unique ID of the user.
 */
function AddVerificationToAllSocketsOfMember(user_id: string) {
	const socketIDs = connectedMembers[user_id];
	if (!socketIDs) return; // This member doesn't have any connected sockets

	socketIDs.slice().forEach(socketID => { // slice() makes a copy of it
		const ws = websocketConnections[socketID];
		if (!ws) return;
		ws.metadata.verified = true;
	});
}


// Limiting the socket count per user ---------------------------------------------------------------------------


/**
 * Returns true if the given IP has the maximum number of websockets opened.
 * @param IP - The IP address
 * @returns *true* if they have too many sockets.
 */
function doesClientHaveMaxSocketCount(IP: string): boolean {
	if (connectedIPs[IP] === undefined) return false;
	return connectedIPs[IP].length >= maxSocketsAllowedPerIP;
}

/**
 * Returns true if the given member has the maximum number of websockets opened.
 * @param jwt - The member's session/refresh token, if they are signed in.
 * @returns *true* if they have too many sockets.
 */
function doesSessionHaveMaxSocketCount(jwt: string): boolean {
	if (connectedSessions[jwt] === undefined) return false;
	return connectedSessions[jwt].length >= maxSocketsAllowedPerSession;
}


// Unsubbing ---------------------------------------------------------------------------


// Set closureNotByChoice to true if you don't immediately want to disconnect them, but say after 5 seconds
function unsubSocketFromAllSubs(ws: CustomWebSocket, closureNotByChoice: boolean) {
	if (!ws.metadata.subscriptions) return; // No subscriptions

	const subscriptions = ws.metadata.subscriptions;
	const subscriptionsKeys = Object.keys(subscriptions);
	for (const key of subscriptionsKeys) handleUnsubbing(ws, key, closureNotByChoice);
}

// Set closureNotByChoice to true if you don't immediately want to disconnect them, but say after 5 seconds
function handleUnsubbing(ws: CustomWebSocket, key: string, closureNotByChoice?: boolean) {
	// What are they wanting to unsubscribe from updates from?
	switch (key) {
		case "invites":
			// Unsubscribe them from the invites list
			unsubFromInvitesList(ws, closureNotByChoice);
			break;
		case "game":
			// If the unsub is not by choice (network interruption instead of closing tab), then we give them
			// a 5 second cushion before starting an auto-resignation timer
			unsubClientFromGameBySocket(ws, { unsubNotByChoice: closureNotByChoice });
			break;
		default:
			console.log(`Cannot unsubscribe user from strange old subscription list ${key}! Socket: ${socketUtility.stringifySocketMetadata(ws)}`);
			return sendSocketMessage(ws, 'general', 'printerror', `Cannot unsubscribe from "${key}" list!`);
	}
}


// Miscellaneous ---------------------------------------------------------------------------


function generateUniqueIDForSocket() {
	return uuid.genUniqueID(4, websocketConnections);
}



export {
	addConnectionToConnectionLists,
	removeConnectionFromConnectionLists,
	terminateAllIPSockets,
	doesClientHaveMaxSocketCount,
	doesSessionHaveMaxSocketCount,
	generateUniqueIDForSocket,
	unsubSocketFromAllSubs,
	handleUnsubbing,
	closeAllSocketsOfSession,
	closeAllSocketsOfMember,
	AddVerificationToAllSocketsOfMember,
};