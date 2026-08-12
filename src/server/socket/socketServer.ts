// src/server/socket/socketServer.ts

import type { Server as HttpsServer } from 'https';

import WebSocket from 'ws';
import { IncomingMessage } from 'http';
import { WebSocketServer as Server } from 'ws';

import { executeSafely } from '../utility/errorGuard.js';
import { runWithRequestID } from '../middleware/requestContext.js';
import { onConnectionRequest } from './openSocket.js';

// Constants ---------------------------------------------------------------------------

/**
 * The maximum size of an incoming websocket message, in bytes. The `ws` receiver rejects
 * anything larger straight from the frame header — before the payload is ever buffered —
 * closing the socket with code 1009 and no reason string.
 *
 * DIRECTLY CONTROLS the maximum distance players can move in online games!
 * A move token carries 4 coordinates (`x,y>x,y`), so 500 KB caps each at
 * ~125,000 digits. At 4.5 digits/sec — the fastest a human can zoom out, on
 * mobile — that's 7.7 hours of nonstop zooming, and WAYYYY longer on desktop.
 * Raise it to raise the reachable board size; the only cost is the memory a
 * single buffered message may occupy.
 */
const MAX_PAYLOAD_BYTES = 500_000; // 500 KB

/**
 * How long `ws` waits for the client's answering close frame before destroying the socket,
 * in milliseconds. Overrides the library's 30 second default.
 *
 * Nothing about a closure is acted on until the 'close' event fires — including telling an
 * opponent their player disconnected. Every close() we call presumes a peer that's still there
 * to receive the reason, and one round trip is all such a peer needs; this bounds the wait for
 * when that presumption turns out to be wrong.
 */
const CLOSE_HANDSHAKE_TIMEOUT_MS = 2500;

// Variables ---------------------------------------------------------------------------

let WebSocketServer: Server;

// Functions ---------------------------------------------------------------------------

function start(httpsServer: HttpsServer): void {
	// Create a WebSocket server instance
	WebSocketServer = new Server({
		server: httpsServer,
		maxPayload: MAX_PAYLOAD_BYTES,
		closeTimeout: CLOSE_HANDSHAKE_TIMEOUT_MS,
	});
	// WebSocketServer.on('connection', onConnectionRequest); // Event handler for new WebSocket connections
	WebSocketServer.on('connection', (socket: WebSocket, req: IncomingMessage) => {
		// An upgrade is an HTTP request → give the handshake a fresh 'R' correlation context,
		// so its reqLog and wsInLog lines share an id. (Counterpart of assignRequestID for HTTP.)
		runWithRequestID(
			() =>
				executeSafely(
					() => onConnectionRequest(socket, req),
					'Error caught within websocket on-connection request:',
				),
			'R',
		);
	}); // Event handler for new WebSocket connections
}

export default {
	start,
};
