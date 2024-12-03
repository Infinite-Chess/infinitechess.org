
/**
 * This script holds all open sockets.
 */

// @ts-ignore
import uuid from "../../client/scripts/esm/util/uuid.js";
// @ts-ignore
import { printIncomingAndClosingSockets } from "../config/config.js";
// @ts-ignore
import wsutility from "./socketUtility.js";
// @ts-ignore
import { closeWebSocketConnection } from "./closeSocket.js";


// Type Definitions ---------------------------------------------------------------------------


// @ts-ignore
import type { CustomWebSocket } from "./socketUtility.js";
// @ts-ignore
import { unsubFromInvitesList } from "../game/invitesmanager/invitesmanager.js";
// @ts-ignore
import { unsubClientFromGameBySocket } from "../game/gamemanager/gamemanager.js";
// @ts-ignore
import { sendSocketMessage } from "./sendSocketMessage.js";


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
 * An object with member names for the keys, and arrays of their
 * socket id's they have open for the value: `{ naviary: ['fighe26'] }`
 */
const connectedMembers: { [username: string]: string[] } = {};

const maxSocketsAllowedPerIP = 10;
const maxSocketsAllowedPerMember = 10;

/**
 * The maximum age a websocket connection will live before auto terminating, in milliseconds.
 * Users have to provide authentication whenever they open a new socket.
 */
const maxWebSocketAgeMillis = 1000 * 60 * 15; // 15 minutes. 
// const maxWebSocketAgeMillis = 1000 * 10; // 10 seconds for dev testing


// Functions ---------------------------------------------------------------------------


function addConnectionToConnectionLists(ws: CustomWebSocket) {
	addConnectionToConnectedWebsockets(ws);
	addConnectionToConnectedIPs(ws.metadata.IP, ws.metadata.id); // Add the conenction to THIS IP's list of connections (so we can cap on a per-IP basis)
	addConnectionToConnectedMembers(ws.metadata.memberInfo.username, ws.metadata.id);

	startTimerToExpireSocket(ws);
	if (printIncomingAndClosingSockets) console.log(`New WebSocket connection established. Socket count: ${Object.keys(websocketConnections).length}. Metadata: ${wsutility.stringifySocketMetadata(ws)}`);
}

function addConnectionToConnectedWebsockets(ws: CustomWebSocket) {
	websocketConnections[ws.metadata.id] = ws;
}

function addConnectionToConnectedIPs(IP: string, id: string) {
	if (connectedIPs[IP] === undefined) connectedIPs[IP] = [];
	connectedIPs[IP].push(id);
}

/**
 * Adds the websocket ID to the list of member's connected sockets.
 * @param username - The member's username, if they are signed in.
 * @param id - The ID of their socket.
 */
function addConnectionToConnectedMembers(username: string | undefined, id: string) {
	if (username === undefined) return; // Not logged in
	if (connectedMembers[username] === undefined) connectedMembers[username] = [];
	connectedMembers[username].push(id);
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
	removeConnectionFromConnectedMembers(ws.metadata.memberInfo.username, ws.metadata.id);

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
 * @param username - The member's username, lowercase.
 * @param id - The ID of their socket.
 */
function removeConnectionFromConnectedMembers(username: string | undefined, id: string) {
	if (username === undefined) return; // Not logged in
	const membersSocketIDsList = connectedMembers[username];
	if (membersSocketIDsList === undefined) return;
	const indexOfSocketID = membersSocketIDsList.indexOf(id);
	membersSocketIDsList.splice(indexOfSocketID, 1);
	if (membersSocketIDsList.length === 0) delete connectedMembers[username];
}

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
 * @param username - The member name.
 * @returns *true* if they have too many sockets.
 */
function doesMemberHaveMaxSocketCount(username: string): boolean {
	if (connectedMembers[username] === undefined) return false;
	return connectedMembers[username].length >= maxSocketsAllowedPerMember;
}

/**
 * Closes all sockets a given member has open.
 * @param username - The member's username, in lowercase.
 * @param closureCode - The code of the socket closure, sent to the client.
 * @param closureReason - The closure reason, sent to the client.
 */
function closeAllSocketsOfMember(username: string, closureCode: number, closureReason: string) {
	connectedMembers[username]?.slice().forEach(socketID => { // slice() makes a copy of it
		const ws = websocketConnections[socketID];
		if (!ws) return;
		closeWebSocketConnection(ws, closureCode, closureReason);
	});
}

function generateUniqueIDForSocket() {
	return uuid.genUniqueID(12, websocketConnections);
}

function startTimerToExpireSocket(ws: CustomWebSocket) {
	ws.metadata.clearafter = setTimeout(closeWebSocketConnection, maxWebSocketAgeMillis, ws, 1000, 'Connection expired'); // Code 1000 for normal closure
}

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
		default: { // Surround this case in a block so that it's variables are not hoisted
			console.log(`Cannot unsubscribe user from strange old subscription list ${key}! Socket: ${wsutility.stringifySocketMetadata(ws)}`);
			return sendSocketMessage(ws, 'general', 'printerror', `Cannot unsubscribe from "${key}" list!`);
		}
	}
}

export {
	addConnectionToConnectionLists,
	removeConnectionFromConnectionLists,
	terminateAllIPSockets,
	doesClientHaveMaxSocketCount,
	doesMemberHaveMaxSocketCount,
	generateUniqueIDForSocket,
	unsubSocketFromAllSubs,
	handleUnsubbing,
	closeAllSocketsOfMember,
};