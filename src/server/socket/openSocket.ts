// src/server/socket/openSocket.ts

/**
 * This script handles socket upgrade connection requests, and creating new sockets.
 */

import type WebSocket from 'ws';
import type { IncomingMessage } from 'http';
import type { CustomWebSocket } from './socketUtility.js';

import { GAME_VERSION } from '../../shared/game_version.js';

import { onclose } from './closeSocket.js';
import socketUtility from './socketUtility.js';
import { onmessage } from './receiveSocketMessage.js';
import { executeSafely } from '../utility/errorGuard.js';
import { sendSocketMessage } from './sendSocketMessage.js';
import { verifyJWTWebSocket } from '../middleware/verifyJWT.js';
import { rateLimitWebSocket } from '../middleware/rateLimit.js';
import { getMemberDataByCriteria } from '../database/memberManager.js';
import { logEvents, logEventsAndPrint, logWebsocketStart } from '../middleware/logEvents.js';
import {
	addConnectionToConnectionLists,
	doesClientHaveMaxSocketCount,
	doesSessionHaveMaxSocketCount,
	generateUniqueIDForSocket,
	terminateAllIPSockets,
} from './socketManager.js';

// Variables ---------------------------------------------------------------------------

// Functions ---------------------------------------------------------------------------

function onConnectionRequest(socket: WebSocket, req: IncomingMessage): void {
	const ws = closeIfInvalidAndAddMetadata(socket, req);
	if (ws === undefined) return; // We will have already closed the socket

	// Rate Limit Here
	// A false could either mean:
	// 1. Too many requests
	// 2. Message too big
	// In ALL these cases, we are terminating all the IPs sockets for now!
	if (!rateLimitWebSocket(req, ws)) {
		// Connection not allowed
		return terminateAllIPSockets(ws.metadata.IP);
	}

	// Check if ip has too many connections
	if (doesClientHaveMaxSocketCount(ws.metadata.IP)) {
		console.log(`Client IP ${ws.metadata.IP} has too many sockets! Not connecting this one.`);
		return ws.close(1009, 'Too Many Sockets');
	}

	// Initialize who they are. Member? Browser ID?...
	verifyJWTWebSocket(ws); // Modifies ws.metadata.memberInfo if they are signed in to add the user_id, username, and roles properties.

	if (
		ws.metadata.memberInfo.signedIn &&
		doesSessionHaveMaxSocketCount(ws.metadata.cookies.jwt!)
	) {
		console.log(
			`Member "${ws.metadata.memberInfo.username}" has too many sockets for this session! Not connecting this one.`,
		);
		return ws.close(1009, 'Too Many Sockets');
	}

	if (!ws.metadata.memberInfo.signedIn && ws.metadata.memberInfo.browser_id === undefined) {
		// Terminate web socket connection request, they NEED authentication!
		console.log(`Authentication needed for WebSocket connection request!! Socket:`);
		socketUtility.printSocket(ws);
		return ws.close(1008, 'Authentication needed'); // Code 1008 is Policy Violation
	}

	addConnectionToConnectionLists(ws);

	logWebsocketStart(req, ws); // Log the request

	addListenersToSocket(req, ws);

	// If user is signed in, use the database to correctly set the property ws.metadata.verified
	if (ws.metadata.memberInfo.signedIn) {
		const record = getMemberDataByCriteria(
			['is_verified'],
			'user_id',
			ws.metadata.memberInfo.user_id,
		);
		// Set the verified status. 1 means true.
		if (record?.is_verified === 1) ws.metadata.verified = true;
	}

	// Send the current game vesion, so they will know whether to refresh.
	sendSocketMessage(ws, 'general', 'gameversion', GAME_VERSION);
}

function closeIfInvalidAndAddMetadata(
	socket: WebSocket,
	req: IncomingMessage,
): CustomWebSocket | undefined {
	// Make sure the connection is secure https
	const origin = req.headers.origin;
	if (origin === undefined || !origin.startsWith('https')) {
		console.error(
			`WebSocket connection request rejected. Reason: Not Secure. Origin: "${origin}"`,
		);
		socket.close(1009, 'Not Secure');
		return;
	}

	// Make sure the origin is our website
	// In DEV_BUILD, allow all origins.
	if (process.env['NODE_ENV'] !== 'development' && origin !== process.env['APP_BASE_URL']) {
		logEvents(
			`WebSocket connection request rejected. Reason: Origin Error. "Origin: ${origin}"   Should be: "${process.env['APP_BASE_URL']}"`,
			'hackLog.txt',
		);
		socket.close(1009, 'Origin Error');
		return;
	}

	const IP = socketUtility.getIPFromWebsocketUpgradeRequest(req);
	if (IP === undefined) {
		logEvents('Unable to identify IP address from websocket connection!', 'hackLog.txt');
		socket.close(1008, 'Unable to identify client IP address'); // Code 1008 is Policy Violation
		return;
	}

	const cookies = socketUtility.getCookiesFromWebsocket(req);
	if (cookies['browser-id'] === undefined) {
		console.log(`Authentication needed for WebSocket connection request!!`);
		socket.close(1008, 'Authentication needed'); // Code 1008 is Policy Violation
		return;
	}

	// Initialize the metadata and cast to a custom websocket object
	const ws = socket as CustomWebSocket; // Cast WebSocket to CustomWebSocket

	ws.metadata = {
		// Parse cookies from the Upgrade http headers
		cookies,
		subscriptions: {},
		userAgent: req.headers['user-agent'],
		memberInfo: { signedIn: false, browser_id: cookies['browser-id'] },
		verified: false,
		id: generateUniqueIDForSocket(), // Sets the ws.metadata.id property of the websocket
		IP,
	};

	return ws;
}

/**
 * Adds the 'message', 'close', and 'error' event listeners to the socket
 */
function addListenersToSocket(req: IncomingMessage, ws: CustomWebSocket): void {
	ws.on('message', (message: Buffer<ArrayBufferLike>) => {
		executeSafely(
			() => onmessage(req, ws, message),
			'Error caught within websocket on-message event:',
		);
	});
	ws.on('close', (code, reason) => {
		executeSafely(
			() => onclose(ws, code, reason),
			'Error caught within websocket on-close event:',
		);
	});
	ws.on('error', (error) => {
		executeSafely(() => onerror(ws, error), 'Error caught within websocket on-error event:');
	});
}

function onerror(ws: CustomWebSocket, error: Error): void {
	const errText = `An error occurred in a websocket. The socket: ${socketUtility.stringifySocketMetadata(ws)}\n${error.stack}`;
	logEventsAndPrint(errText, 'errLog.txt');
}

export { onConnectionRequest };
