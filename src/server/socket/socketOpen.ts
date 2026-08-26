// src/server/socket/socketOpen.ts

/**
 * This script handles socket upgrade connection requests, and creating new sockets.
 */

import type WebSocket from 'ws';
import type { IncomingMessage } from 'http';
import type { CustomWebSocket } from './socketTypes.js';

import { parse as parseCookie } from 'cookie';

import socketutil from '../../shared/util/socketutil.js';

import ip from '../utility/ip.js';
import reqLogger from '../utility/reqLogger.js';
import logEvents from '../utility/logEvents.js';
import socketsend from './socketSend.js';
import errorGuard from '../utility/errorGuard.js';
import socketClose from './socketClose.js';
import reqLanguage from '../config/reqLanguage.js';
import requestMeter from '../utility/requestMeter.js';
import socketLogger from './socketLogger.js';
import socketReceive from './socketReceive.js';
import socketRegistry from './socketRegistry.js';
import requestContext from '../utility/requestContext.js';
import reqTranslations from '../config/reqTranslations.js';
import identityResolver from '../auth/identityResolver.js';

// Functions ----------------------------------------------------------------------------------

/** Gates and completes every websocket upgrade request: validation, metadata, listeners. */
function onConnectionRequest(socket: WebSocket, req: IncomingMessage): void {
	// Log every upgrade attempt to reqLog — even ones we reject below.
	// Successful upgrades are logged below to wsInLog with more metadata.
	reqLogger.incoming(req);

	const ws = closeIfInvalidAndAddMetadata(socket, req);
	if (ws === undefined) return; // We will have already closed the socket

	// Rate limit here. If they're over the cap, close their
	// socket and terminate all the IP's sockets for now!
	requestMeter.recordRecent();
	if (requestMeter.meter(ws.metadata.IP, ws.metadata.userAgent) !== undefined) {
		ws.close(1009, socketutil.ClosureReasons.TOO_MANY_REQUESTS);
		return socketRegistry.terminateAllOfIP(ws.metadata.IP);
	}

	// Check if ip has too many connections
	if (socketRegistry.doesClientHaveMaxCount(ws.metadata.IP)) {
		console.log(`Client IP ${ws.metadata.IP} has too many sockets! Not connecting this one.`);
		return ws.close(1009, socketutil.ClosureReasons.TOO_MANY_SOCKETS);
	}

	// Initialize who they are. Member? Browser ID?...
	// Validates their refresh-token cookie against the database. If they are signed
	// in, adds their user_id, username, and roles to the socket metadata's memberInfo.
	ws.metadata.memberInfo = identityResolver.resolveIdentity(
		ws.metadata.memberInfo,
		ws.metadata.cookies.jwt,
		ws.metadata.IP,
	).memberInfo;

	if (
		ws.metadata.memberInfo.signedIn &&
		socketRegistry.doesSessionHaveMaxCount(ws.metadata.cookies.jwt!)
	) {
		console.log(`Member "${ws.metadata.memberInfo.username}" has too many sockets for this session! Not connecting this one.`); // prettier-ignore
		return ws.close(1009, socketutil.ClosureReasons.TOO_MANY_SOCKETS);
	}

	socketRegistry.add(ws);

	socketLogger.logOpen(ws); // Log the opened socket in wsInLog with more metadata.

	addListenersToSocket(ws);

	// Announce our protocol version, so a client running pre-protocol-change code knows to refresh.
	socketsend.send(ws, 'general', 'protocolversion', socketutil.PROTOCOL_VERSION);
}

/**
 * Validates the upgrade request, closing the socket on any failure.
 * On success, attaches the socket's metadata (cookies, identity, id, IP) and translations.
 * Returns the custom websocket, or undefined if the request was rejected.
 */
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
		logEvents.add(
			`WebSocket connection request rejected. Reason: Origin Error. "Origin: ${origin}"   Should be: "${process.env['APP_BASE_URL']}"`,
			'hackLog',
		);
		socket.close(1008, socketutil.ClosureReasons.ORIGIN_ERROR);
		return;
	}

	const clientIP = ip.get(req);
	if (clientIP === undefined) {
		logEvents.add('Unable to identify IP address from websocket connection!', 'hackLog');
		socket.close(1008, socketutil.ClosureReasons.UNIDENTIFIABLE_IP);
		return;
	}

	const userAgent = req.headers['user-agent'];
	if (!userAgent) {
		// Occasionally, automated scanner and vulnerability prober bots will omit the user agent.
		socket.close(1008, socketutil.ClosureReasons.USER_AGENT_REQUIRED);
		return;
	}

	// req.cookies is only set by our cookie-parser middleware for regular requests,
	// NOT for websocket upgrade requests, so we parse the raw header ourselves.
	const cookies = parseCookie(req.headers.cookie ?? '');
	if (cookies['browser-id'] === undefined) {
		// Can happen if the client has cookies disabled
		socket.close(1008, socketutil.ClosureReasons.AUTHENTICATION_NEEDED);
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
		id: socketRegistry.generateUniqueID(), // Sets the ws.metadata.id property of the websocket
		IP: clientIP,
		echoTimers: {},
	};

	// Bind this connection's translations
	ws.t = reqTranslations.build(reqLanguage.resolve(req));

	return ws;
}

/**
 * Adds the 'message', 'close', and 'error' event listeners to the socket
 */
function addListenersToSocket(ws: CustomWebSocket): void {
	ws.on('message', (message: Buffer<ArrayBufferLike>) => {
		// Each incoming message gets its own correlation ID,
		// tagging every log line its processing produces.
		// (Counterpart of requestContext.assignID for HTTP.)
		requestContext.runWithID(
			() =>
				errorGuard.executeSafely(
					() => socketReceive.onmessage(ws, message),
					'Error caught within websocket on-message event:',
				),
			'W',
		);
	});
	ws.on('close', (code, reason) => {
		errorGuard.executeSafely(
			() => socketClose.onclose(ws, code, reason),
			'Error caught within websocket on-close event:',
		);
	});
	ws.on('error', (error) => {
		errorGuard.executeSafely(
			() => onerror(error),
			'Error caught within websocket on-error event:',
		);
	});
}

/**
 * Logs a websocket error. Malformed-frame errors from `ws` are swallowed — they're
 * benign client-side issues that would flood errLog — everything else lands there.
 */
function onerror(error: Error): void {
	// The `ws` library tags malformed-frame errors with a "WS_ERR_" code (e.g. WS_ERR_INVALID_CLOSE_CODE for a
	// Close frame with reserved code 1006) and already closes the connection (status 1002). Not a
	// server bug, so we ignore them rather than pollute errLog.txt. Those error lines would look like:
	// 'RangeError: Invalid WebSocket frame: invalid status code 1006'
	// Cause (from errLog analysis): client stacks/proxies on flaky networks (mobile, VPNs, webviews)
	// that echo their own abnormal-disconnect code onto the wire — a compliant browser can never
	// transmit 1006. Rare, benign, entirely client-side.
	if ('code' in error && typeof error.code === 'string' && error.code.startsWith('WS_ERR_')) {
		// The exception: a message exceeding MAX_PAYLOAD_BYTES (see socketServer.ts), which
		// the receiver rejected before buffering it. Nearly always hand-crafted, but an honest
		// client and extremely determined individual can reach it too — a move token only gets
		// this big after ~8 hours of nonstop max-rate zooming out on mobile, so it's worth
		// knowing if it ever happens.
		if (error.code === 'WS_ERR_UNSUPPORTED_MESSAGE_LENGTH')
			logEvents.add('Client sent too big a websocket message.', 'hackLog');
		return;
	}

	const errText = `An error occurred in a websocket: ${error.stack}`;
	logEvents.addAndPrint(errText, 'errLog');
}

// Exports ------------------------------------------------------------------------------------

export default { onConnectionRequest };
