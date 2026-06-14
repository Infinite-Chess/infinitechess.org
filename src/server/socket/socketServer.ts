// src/server/socket/socketServer.ts

import type { Server as HttpsServer } from 'https';

import WebSocket from 'ws';
import { IncomingMessage } from 'http';
import { WebSocketServer as Server } from 'ws';

import { executeSafely } from '../utility/errorGuard.js';
import { runWithRequestID } from '../middleware/requestContext.js';
import { onConnectionRequest } from './openSocket.js';

let WebSocketServer: Server;

function start(httpsServer: HttpsServer): void {
	WebSocketServer = new Server({ server: httpsServer }); // Create a WebSocket server instance
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
