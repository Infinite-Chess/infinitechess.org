
/**
 * This script handles socket, upgrade connection requests, and creates new sockets
 */

import { DEV_BUILD, HOST_NAME } from '../config/config.js';
import { rateLimitWebSocket } from '../middleware/rateLimit.js';

// Type Definitions ---------------------------------------------------------------------------


/**
 * Type Definitions
 * @typedef {import('../game/TypeDefinitions.js').WebsocketMessage} WebsocketMessage
 */

import type { IncomingMessage } from 'http'; // Used for the socket upgrade http request TYPE
import type WebSocket from 'ws';
import type { CustomWebSocket } from '../game/wsutility.js';
import wsutility from '../game/wsutility.js';
import { logEvents } from '../middleware/logEvents.js';
import { verifyJWTWebSocket } from '../middleware/verifyJWT.js';


// Variables ---------------------------------------------------------------------------


const maxSocketsAllowedPerIP = 10;
const maxSocketsAllowedPerMember = 10;


// Functions ---------------------------------------------------------------------------


/**
 * The maximum age a websocket connection will live before auto terminating, in milliseconds.
 * Users have to provide authentication whenever they open a new socket.
 */
const maxWebSocketAgeMillis = 1000 * 60 * 15; // 15 minutes. 
// const maxWebSocketAgeMillis = 1000 * 10; // 10 seconds for dev testing



function onConnectionRequest(socket: WebSocket, req: IncomingMessage) { 

	const ws = closeIfInvalidAndAddMetadata(socket, req);
	if (ws === undefined) return; // We will have already closed the socket

	// Rate Limit Here
	// A false could either mean:
	// 1. Too many requests
	// 2. Message too big
	// In ALL these cases, we are terminating all the IPs sockets for now!
	if (!rateLimitWebSocket(req, ws)) { // Connection not allowed
		return terminateAllIPSockets(ws.metadata.IP);
	};

	// Check if ip has too many connections
	if (clientHasMaxSocketCount(ws.metadata.IP)) {
		console.log(`Client IP ${ws.metadata.IP} has too many sockets! Not connecting this one.`);
		return ws.close(1009, 'Too Many Sockets');
	}
	
	// Initialize who they are. Member? Browser ID?...
	verifyJWTWebSocket(ws); // Modifies ws.metadata.memberInfo if they are signed in to add the user_id, username, and roles properties.

	if (ws.metadata.memberInfo.signedIn && memberHasMaxSocketCount(ws.metadata.memberInfo.username)) {
		console.log(`Member ${ws.metadata.memberInfo.username} has too many sockets! Not connecting this one.`);
		return ws.close(1009, 'Too Many Sockets');
	}

	if (!ws.metadata.memberInfo.signedIn && ws.metadata.cookies['browser-id'] === undefined) { // Terminate web socket connection request, they NEED authentication!
		console.log(`Authentication needed for WebSocket connection request!! Socket:`);
		wsutility.printSocket(ws);
		return ws.close(1008, 'Authentication needed'); // Code 1008 is Policy Violation
	}


	websocketConnections[id] = ws; // Add the connection to our list of all websocket connections
	addConnectionToConnectedIPs(ws.metadata.IP, id); // Add the conenction to THIS IP's list of connections (so we can cap on a per-IP basis)
	addConnectionToConnectedMembers(ws.metadata.memberInfo.username, id);

	// Log the request
	logWebsocketStart(req, ws);

	if (printIncomingAndClosingSockets) console.log(`New WebSocket connection established. Socket count: ${Object.keys(websocketConnections).length}. Metadata: ${wsutility.stringifySocketMetadata(ws)}`);

	ws.on('message', (message) => { executeSafely(onmessage, 'Error caught within websocket on-message event:', req, ws, message); });
	ws.on('close', (code, reason) => { executeSafely(onclose, 'Error caught within websocket on-close event:', ws, code, reason); });
	ws.on('error', (error) => { executeSafely(onerror, 'Error caught within websocket on-error event:', ws, error); });

	// We include the sendmessage function on the websocket to avoid circular dependancy with these scripts!
	ws.metadata.sendmessage = sendmessage;

	ws.metadata.clearafter = setTimeout(closeWebSocketConnection, maxWebSocketAgeMillis, ws, 1000, 'Connection expired'); // Code 1000 for normal closure

	// Send the current game vesion, so they will know whether to refresh.
	sendmessage(ws, 'general', 'gameversion', GAME_VERSION);
}

function closeIfInvalidAndAddMetadata(socket: WebSocket, req: IncomingMessage): CustomWebSocket | undefined {
	
	// Make sure the connection is secure https
	const origin = req.headers.origin;
	if (origin === undefined || !origin.startsWith('https')) {
		logEvents(`WebSocket connection request rejected. Reason: Not Secure. Origin: "${origin}"`, 'hackLog.txt');
		socket.close(1009, "Not Secure");
		return;
	}

	// Make sure the origin is our website
	if (!DEV_BUILD && origin !== `https://${HOST_NAME}`) { // In DEV_BUILD, allow all origins.
		logEvents(`WebSocket connection request rejected. Reason: Origin Error. "Origin: ${origin}"   Should be: "https://${HOST_NAME}"`, 'hackLog.txt');
		socket.close(1009, "Origin Error");
		return;
	}

	const IP = wsutility.getIPFromWebsocket(req, socket);
	if (IP === undefined) {
		logEvents('Unable to identify IP address from websocket connection!', 'hackLog.txt');
		socket.close(1008, 'Unable to identify client IP address'); // Code 1008 is Policy Violation
		return;
	}

	// Initialize the metadata and cast to a custom websocket object
	const ws = socket as CustomWebSocket; // Cast WebSocket to CustomWebSocket
	ws.metadata = {
		// Parse cookies from the Upgrade http headers
		cookies: wsutility.getCookiesFromWebsocket(req),
		subscriptions: {},
		userAgent: req.headers['user-agent'],
		memberInfo: { signedIn: false },
		id: giveWebsocketUniqueID(ws), // Sets the ws.metadata.id property of the websocket
		IP,
	};

	return ws;
}



function onerror(ws, error) {
	const errText = `An error occurred in a websocket. ${wsutility.stringifySocketMetadata(ws)}\n${error.stack}`;
	logEvents(errText, 'errLog.txt', { print: true });
}

// Sets the metadata.id property of the websocket connection!
function giveWebsocketUniqueID(ws) {
	const id = genUniqueID(12, websocketConnections);
	ws.metadata.id = id;
	return id;
}


/**
 * Returns true if the given IP has the maximum number of websockets opened.
 * @param {number} IP - The IP address
 * @returns {boolean} *true* if they have too many sockets.
 */
function clientHasMaxSocketCount(IP) {
	return connectedIPs[IP]?.length >= maxSocketsAllowedPerIP;
}




export {
	onConnectionRequest
};