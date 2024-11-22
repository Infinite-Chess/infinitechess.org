
/**
 * This script holds all open sockets.
 */

/**
 * Type Definitions
 * @typedef {import('../game/TypeDefinitions.js').Socket} Socket
 * @typedef {import('../game/TypeDefinitions.js').WebsocketMessage} WebsocketMessage
 */

/**
 * An object containing all active websocket connections, with their ID's for the keys: `{ 21: websocket }`
 */
const websocketConnections = {}; // Object containing all active web socket connections, with their ID's for the KEY
/**
 * An object with IP addresses for the keys, and arrays of their
 * socket id's they have open for the value: `{ "83.28.68.253": [21] }`
 */
const connectedIPs = {}; // Keys are the IP. Values are array lists containing all connection IDs they have going.
/**
 * An object with member names for the keys, and arrays of their
 * socket id's they have open for the value: `{ naviary: [21] }`
 */
const connectedMembers = {};





const timeOfInactivityToRenewConnection = 10000;



function addConnectionToConnectedIPs(IP, id) {
	if (!connectedIPs[IP]) connectedIPs[IP] = [];
	connectedIPs[IP].push(id);
}
/**
 * Adds the websocket ID to the list of member's connected sockets.
 * @param {string} member - The member's username, lowercase.
 * @param {number} socketID - The ID of their socket.
 */
function addConnectionToConnectedMembers(member, socketID) {
	if (!member) return; // Not logged in
	if (!connectedMembers[member]) connectedMembers[member] = [];
	connectedMembers[member].push(socketID);
}

function removeConnectionFromConnectedIPs(IP, id) {
	const connectionList = connectedIPs[IP];
	if (!connectionList) return;
	if (connectedIPs[IP].length === 0) return console.log("connectedIPs[IP] is DEFINED [], yet EMPTY! If it's empty, it should have been deleted!");
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
 * @param {string} member - The member's username, lowercase.
 * @param {number} socketID - The ID of their socket.
 */
function removeConnectionFromConnectedMembers(member, socketID) {
	if (!member) return; // Not logged in
	const membersSocketIDsList = connectedMembers[member];
	const indexOfSocketID = membersSocketIDsList.indexOf(socketID);
	membersSocketIDsList.splice(indexOfSocketID, 1);
	if (membersSocketIDsList.length === 0) delete connectedMembers[member];
}

/**
 * 
 * @param {string} IP 
 * @returns 
 */
function terminateAllIPSockets(IP) {
	if (!IP) return;
	const connectionList = connectedIPs[IP];
	if (!connectionList) return; // IP is defined, but they don't have any sockets to terminate!
	for (const id of connectionList) {
		//console.log(`Terminating 1.. id ${id}`)
		const ws = websocketConnections[id];
		ws.close(1009, 'Message Too Big'); // Perhaps this will be a duplicate close action? Because rateLimit.js also can also close the socket.
	}

	// console.log(`Terminated all of IP ${IP}`)
	// console.log(connectedIPs) // This will still be full because they aren't actually spliced out of their list until the close() is complete!
}

/**
 * Returns true if the given member has the maximum number of websockets opened.
 * @param {string} member - The member name, in lowercase.
 * @returns {boolean} *true* if they have too many sockets.
 */
function memberHasMaxSocketCount(member) {
	return connectedMembers[member]?.length >= maxSocketsAllowedPerMember;
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