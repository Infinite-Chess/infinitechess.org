// src/server/socket/openSocket.ts

/**
 * This script handles socket upgrade connection requests, and creating new sockets.
 */

import type WebSocket from 'ws';
import type { IncomingMessage } from 'http';
import type { CustomWebSocket } from './socketUtility.js';

import { parse as parseCookie } from 'cookie';

import { GAME_VERSION } from '../../shared/game_version.js';

import { onclose } from './closeSocket.js';
import socketUtility from './socketUtility.js';
import { onmessage } from './receiveSocketMessage.js';
import { getClientIP } from '../utility/IP.js';
import { executeSafely } from '../utility/errorGuard.js';
import { runWithRequestID } from '../middleware/requestContext.js';
import { sendSocketMessage } from './sendSocketMessage.js';
import { buildTranslations } from '../middleware/reqTranslations.js';
import { logWebsocketStart } from './wsLogger.js';
import { logIncomingRequest } from '../middleware/reqLogger.js';
import { rateLimitWebSocket } from '../middleware/rateLimit.js';
import { resolveAuth_WebSocket } from '../middleware/resolveAuth.js';
import { getMemberDataByCriteria } from '../database/memberManager.js';
import { resolveLanguageForRequest } from '../middleware/reqLanguage.js';
import { logEvents, logEventsAndPrint } from '../middleware/logEvents.js';
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
	// Log every upgrade attempt to reqLog — even ones we reject below.
	// Successful upgrades are logged below to wsInLog with more metadata.
	logIncomingRequest(req);

	const ws = closeIfInvalidAndAddMetadata(socket, req);
	if (ws === undefined) return; // We will have already closed the socket

	// Rate Limit Here
	// A false could either mean:
	// 1. Too many requests
	// 2. Message too big
	// In ALL these cases, we are terminating all the IPs sockets for now!
	if (!rateLimitWebSocket(ws)) {
		// Connection not allowed
		return terminateAllIPSockets(ws.metadata.IP);
	}

	// Check if ip has too many connections
	if (doesClientHaveMaxSocketCount(ws.metadata.IP)) {
		console.log(`Client IP ${ws.metadata.IP} has too many sockets! Not connecting this one.`);
		return ws.close(1009, 'Too Many Sockets');
	}

	// Initialize who they are. Member? Browser ID?...
	resolveAuth_WebSocket(ws); // Modifies ws.metadata.memberInfo if they are signed in to add the user_id, username, and roles properties.

	if (
		ws.metadata.memberInfo.signedIn &&
		doesSessionHaveMaxSocketCount(ws.metadata.cookies.jwt!)
	) {
		console.log(
			`Member "${ws.metadata.memberInfo.username}" has too many sockets for this session! Not connecting this one.`,
		);
		return ws.close(1009, 'Too Many Sockets');
	}

	addConnectionToConnectionLists(ws);

	logWebsocketStart(ws); // Log the opened socket in wsInLog with more metadata.

	addListenersToSocket(ws);

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
	// In DEV_BUILD, allow all origins.
	const origin = req.headers.origin;
	if (
		origin === undefined ||
		(process.env['NODE_ENV'] !== 'development' && origin !== process.env['APP_BASE_URL'])
	) {
		logEvents(
			`WebSocket connection request rejected. Reason: Origin Error. "Origin: ${origin}"   Should be: "${process.env['APP_BASE_URL']}"`,
			'hackLog',
		);
		socket.close(1008, 'Origin Error');
		return;
	}

	const IP = getClientIP(req);
	if (IP === undefined) {
		logEvents('Unable to identify IP address from websocket connection!', 'hackLog');
		socket.close(1008, 'Unable to identify client IP address');
		return;
	}

	const userAgent = req.headers['user-agent'];
	if (!userAgent) {
		// Occasionally, automated scanner and vulnerability prober bots will omit the user agent.
		socket.close(1008, 'User agent is required');
		return;
	}

	// req.cookies is only set by our cookie-parser middleware for regular requests,
	// NOT for websocket upgrade requests, so we parse the raw header ourselves.
	const cookies = parseCookie(req.headers.cookie ?? '');
	if (cookies['browser-id'] === undefined) {
		// Can happen if the client has cookies disabled
		socket.close(1008, 'Authentication needed');
		return;
	}

	// Initialize the metadata and cast to a custom websocket object
	const ws = socket as CustomWebSocket; // Cast WebSocket to CustomWebSocket

	ws.metadata = {
		// Parse cookies from the Upgrade http headers
		cookies,
		subscriptions: {},
		userAgent,
		memberInfo: { signedIn: false, browser_id: cookies['browser-id'] },
		verified: false,
		id: generateUniqueIDForSocket(), // Sets the ws.metadata.id property of the websocket
		IP,
	};

	// Bind this connection's translations
	ws.t = buildTranslations(resolveLanguageForRequest(req));

	return ws;
}

/**
 * Adds the 'message', 'close', and 'error' event listeners to the socket
 */
function addListenersToSocket(ws: CustomWebSocket): void {
	ws.on('message', (message: Buffer<ArrayBufferLike>) => {
		// Each incoming message gets its own correlation ID,
		// tagging every log line its processing produces.
		// (Counterpart of assignRequestID for HTTP.)
		runWithRequestID(
			() =>
				executeSafely(
					() => onmessage(ws, message),
					'Error caught within websocket on-message event:',
				),
			'W',
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
	// `ws` tags malformed-frame errors with a "WS_ERR_" code (e.g. WS_ERR_INVALID_CLOSE_CODE for a
	// Close frame with reserved code 1006) and already closes the connection (status 1002). Not a
	// server bug, so we ignore them rather than pollute errLog.txt. Cause (from errLog analysis):
	// client stacks/proxies on flaky networks (mobile, VPNs, webviews) that echo their own
	// abnormal-disconnect code onto the wire — a compliant browser can never transmit 1006. Rare,
	// benign, entirely client-side.
	if ('code' in error && typeof error.code === 'string' && error.code.startsWith('WS_ERR_'))
		return;

	const errText = `An error occurred in a websocket. The socket: ${socketUtility.stringifySocketMetadata(ws)}\n${error.stack}`;
	logEventsAndPrint(errText, 'errLog');
}

export { onConnectionRequest };
