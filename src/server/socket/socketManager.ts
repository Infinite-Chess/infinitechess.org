
/**
 * This script stores all open websockets organized by ID, IP, and session.
 * 
 * This contains methods for terminating all websockets by given criteria,
 * Rate limiting the socket count per user,
 * And unsubbing a socket from subscriptions.
 */

import socketUtility from "./socketUtility.js";
import { sendSocketMessage } from "./sendSocketMessage.js";
// @ts-ignore
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
	addConnectionToConnectedIPs(ws.metadata.IP, ws.metadata.id); // Add the connection to THIS IP's list of connections (so we can cap on a per-IP basis)
	addConnectionToConnectedSessions(ws.metadata.cookies.jwt, ws.metadata.id);

	startTimerToExpireSocket(ws);
	if (printIncomingAndClosingSockets) console.log(`New WebSocket connection established. Socket count: ${Object.keys(websocketConnections).length}. Metadata: ${socketUtility.stringifySocketMetadata(ws)}`);
}

function addConnectionToConnectedIPs(IP: string, id: string) {
	if (connectedIPs[IP] === undefined) connectedIPs[IP] = [];
	connectedIPs[IP].push(id);
}

/**
 * Adds the websocket ID to the list of member's connected sockets.
 * @param jwt - The member's session/refresh token, if they are signed in.
 * @param id - The ID of their socket.
 */
function addConnectionToConnectedSessions(jwt: string | undefined, id: string) {
	if (jwt === undefined) return; // Not logged in
	if (connectedSessions[jwt] === undefined) connectedSessions[jwt] = [];
	connectedSessions[jwt].push(id);
}

function startTimerToExpireSocket(ws: CustomWebSocket) {
	ws.metadata.clearafter = setTimeout(() => ws.close(1000, 'Connection expired'), maxWebSocketAgeMillis); // We pass in an arrow function so it doesn't lose scope of ws.
}

/**
 * 
 * @param ws - The socket
 * @param code - The socket closure code
 * @param reason - The socket closure reason
 */
function removeConnectionFromConnectionLists(ws: CustomWebSocket, code: number, reason: string) {
	delete websocketConnections[ws.metadata.id];
	removeConnectionFromConnectedIPs(ws.metadata.IP, ws.metadata.id);
	removeConnectionFromConnectedSessions(ws.metadata.cookies.jwt, ws.metadata.id);

	clearTimeout(ws.metadata.clearafter); // Cancel the timer to auto delete it at the end of its life
	if (printIncomingAndClosingSockets) console.log(`WebSocket connection has been closed. Code: ${code}. Reason: ${reason}. Socket count: ${Object.keys(websocketConnections).length}`);
}

function removeConnectionFromConnectedIPs(IP: string, id: string) {
	const connectionList = connectedIPs[IP];
	if (connectionList === undefined) return;
	// Check if the value exists in the array
	const index = connectionList.indexOf(id);
	if (index === -1) return;
	// Remove the item at the found index
	connectionList.splice(index, 1);

	// If it's now empty, just delete the ip entirely
	if (connectionList.length === 0) delete connectedIPs[IP];
}

/**
 * Removes the websocket ID from the list of member's connected sockets.
 * @param jwt - The member's session/refresh token, if they are signed in.
 * @param id - The ID of their socket.
 */
function removeConnectionFromConnectedSessions(jwt: string | undefined, id: string) {
	if (jwt === undefined) return; // Not logged in
	const sessionsSocketIDsList = connectedSessions[jwt];
	if (sessionsSocketIDsList === undefined) return;
	const indexOfSocketID = sessionsSocketIDsList.indexOf(id);
	sessionsSocketIDsList.splice(indexOfSocketID, 1);
	if (sessionsSocketIDsList.length === 0) delete connectedSessions[jwt];
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
	return uuid.genUniqueID(12, websocketConnections);
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
};