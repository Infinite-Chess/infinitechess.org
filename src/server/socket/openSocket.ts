
/**
 * This script handles socket upgrade connection requests, and creating new sockets.
 */

import socketUtility from './socketUtility.js';
import { sendSocketMessage } from './sendSocketMessage.js';
import { addConnectionToConnectionLists, doesClientHaveMaxSocketCount, doesSessionHaveMaxSocketCount, generateUniqueIDForSocket, terminateAllIPSockets } from './socketManager.js';
import { onmessage } from './receiveSocketMessage.js';
import { onclose } from './closeSocket.js';
// @ts-ignore
import { getMemberDataByCriteria } from '../database/memberManager.js';
// @ts-ignore
import { DEV_BUILD, GAME_VERSION, HOST_NAME } from '../config/config.js';
// @ts-ignore
import { rateLimitWebSocket } from '../middleware/rateLimit.js';
// @ts-ignore
import { logEvents, logWebsocketStart } from '../middleware/logEvents.js';
// @ts-ignore
import { verifyJWTWebSocket } from '../middleware/verifyJWT.js';
// @ts-ignore
import { executeSafely } from '../utility/errorGuard.js';


// Type Definitions ---------------------------------------------------------------------------


import type { IncomingMessage } from 'http'; // Used for the socket upgrade http request TYPE
import type WebSocket from 'ws';
import type { CustomWebSocket } from './socketUtility.js';


// Variables ---------------------------------------------------------------------------





// Functions ---------------------------------------------------------------------------


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
	if (doesClientHaveMaxSocketCount(ws.metadata.IP)) {
		console.log(`Client IP ${ws.metadata.IP} has too many sockets! Not connecting this one.`);
		return ws.close(1009, 'Too Many Sockets');
	}
	
	// Initialize who they are. Member? Browser ID?...
	verifyJWTWebSocket(ws); // Modifies ws.metadata.memberInfo if they are signed in to add the user_id, username, and roles properties.

	if (ws.metadata.memberInfo.signedIn && doesSessionHaveMaxSocketCount(ws.metadata.cookies.jwt!)) {
		console.log(`Member "${ws.metadata.memberInfo.username}" has too many sockets for this session! Not connecting this one.`);
		return ws.close(1009, 'Too Many Sockets');
	}

	if (!ws.metadata.memberInfo.signedIn && ws.metadata.cookies['browser-id'] === undefined) { // Terminate web socket connection request, they NEED authentication!
		console.log(`Authentication needed for WebSocket connection request!! Socket:`);
		socketUtility.printSocket(ws);
		return ws.close(1008, 'Authentication needed'); // Code 1008 is Policy Violation
	}

	addConnectionToConnectionLists(ws);

	logWebsocketStart(req, ws); // Log the request

	addListenersToSocket(req, ws);

	// If user is signed in, use the database to correctly set the property ws.metadata.verified
	if (ws.metadata.memberInfo.signedIn && ws.metadata.memberInfo?.user_id !== undefined) {
		let { verification } = getMemberDataByCriteria(['verification'], 'user_id', ws.metadata.memberInfo.user_id, { skipErrorLogging: true });
		verification = JSON.parse(verification); // string needs to be parsed to a JSON
		if (verification === null || verification.verified) ws.metadata.verified = true; // user is verified
	}

	// Send the current game vesion, so they will know whether to refresh.
	sendSocketMessage(ws, 'general', 'gameversion', GAME_VERSION);
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

	const IP = socketUtility.getIPFromWebsocketUpgradeRequest(req);
	if (IP === undefined) {
		logEvents('Unable to identify IP address from websocket connection!', 'hackLog.txt');
		socket.close(1008, 'Unable to identify client IP address'); // Code 1008 is Policy Violation
		return;
	}

	// Initialize the metadata and cast to a custom websocket object
	const ws = socket as CustomWebSocket; // Cast WebSocket to CustomWebSocket
	ws.metadata = {
		// Parse cookies from the Upgrade http headers
		cookies: socketUtility.getCookiesFromWebsocket(req),
		subscriptions: {},
		userAgent: req.headers['user-agent'],
		memberInfo: { signedIn: false },
		verified: false,
		id: generateUniqueIDForSocket(), // Sets the ws.metadata.id property of the websocket
		IP,
	};

	return ws;
}

/**
 * Adds the 'message', 'close', and 'error' event listeners to the socket
 */
function addListenersToSocket(req: IncomingMessage, ws: CustomWebSocket) {
	ws.on('message', (message) => { executeSafely(onmessage, 'Error caught within websocket on-message event:', req, ws, message); });
	ws.on('close', (code, reason) => { executeSafely(onclose, 'Error caught within websocket on-close event:', ws, code, reason); });
	ws.on('error', (error) => { executeSafely(onerror, 'Error caught within websocket on-error event:', ws, error); });
}

function onerror(ws: CustomWebSocket, error: Error) {
	const errText = `An error occurred in a websocket. The socket: ${socketUtility.stringifySocketMetadata(ws)}\n${error.stack}`;
	logEvents(errText, 'errLog.txt', { print: true });
}



export {
	onConnectionRequest
};