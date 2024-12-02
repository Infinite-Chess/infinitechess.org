
/**
 * This script holds all open sockets.
 */

import uuid from "../../client/scripts/esm/util/uuid";
import { printIncomingAndClosingSockets } from "../config/config";
import wsutility from "../game/wsutility";
import { closeWebSocketConnection } from "./closeSocket";


// Type Definitions ---------------------------------------------------------------------------


/**
 * Type Definitions
 * @typedef {import('../game/TypeDefinitions.js').WebsocketMessage} WebsocketMessage
 */

import type { CustomWebSocket } from "../game/wsutility";


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

const timeOfInactivityToRenewConnection = 10000;


// Functions ---------------------------------------------------------------------------


function addConnectionToConnectionLists(ws: CustomWebSocket) {
	addConnectionToConnectedWebsockets(ws);
	addConnectionToConnectedIPs(ws.metadata.IP, ws.metadata.id); // Add the conenction to THIS IP's list of connections (so we can cap on a per-IP basis)
	addConnectionToConnectedMembers(ws.metadata.memberInfo.username, ws.metadata.id);

	startTimerToExpireSocket(ws);
}

function addConnectionToConnectedWebsockets(ws: CustomWebSocket) {
	websocketConnections[ws.metadata.id] = ws;
	if (printIncomingAndClosingSockets) console.log(`New WebSocket connection established. Socket count: ${Object.keys(websocketConnections).length}. Metadata: ${wsutility.stringifySocketMetadata(ws)}`);
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

function removeConnectionFromConnectionLists(ws: CustomWebSocket) {
	removeConnectionFromConnectedIPs(ws.metadata.IP, ws.metadata.id);
	removeConnectionFromConnectedMembers(ws.metadata.memberInfo.username, ws.metadata.id);
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
		ws.close(1009, 'Message Too Big');
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
	return connectedIPs[IP]?.length >= maxSocketsAllowedPerIP;
}

/**
 * Returns true if the given member has the maximum number of websockets opened.
 * @param username - The member name.
 * @returns *true* if they have too many sockets.
 */
function doesMemberHaveMaxSocketCount(username: string): boolean {
	return connectedMembers[username]?.length >= maxSocketsAllowedPerMember;
}

/**
 * Closes all sockets a given member has open.
 * @param {string} member - The member's username, in lowercase.
 * @param {number} closureCode - The code of the socket closure, sent to the client.
 * @param {string} closureReason - The closure reason, sent to the client.
 */
function closeAllSocketsOfMember(member, closureCode, closureReason) {
	connectedMembers[member]?.slice().forEach(socketID => { // slice() makes a copy of it
		const ws = websocketConnections[socketID];
		closeWebSocketConnection(ws, closureCode, closureReason);
	});
}

function generateUniqueIDForSocket(ws: CustomWebSocket) {
	return uuid.genUniqueID(12, websocketConnections)
}

function startTimerToExpireSocket(ws: CustomWebSocket) {
	ws.metadata.clearafter = setTimeout(closeWebSocketConnection, maxWebSocketAgeMillis, ws, 1000, 'Connection expired'); // Code 1000 for normal closure
}

export {
	addConnectionToConnectionLists,
	removeConnectionFromConnectionLists,
	terminateAllIPSockets,
	doesClientHaveMaxSocketCount,
	doesMemberHaveMaxSocketCount,
	generateUniqueIDForSocket,
}