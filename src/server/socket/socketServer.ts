// src/server/socket/socketServer.ts

import { WebSocketServer as Server } from 'ws';
import { IncomingMessage } from 'http';

// Custom imports...

import WebSocket from 'ws';

import { onConnectionRequest } from './openSocket.js';
// @ts-ignore
import { executeSafely } from '../utility/errorGuard.js';

// Type Definitions...

import type { Server as HttpsServer } from 'https';

let WebSocketServer: Server;

function start(httpsServer: HttpsServer): void {
	WebSocketServer = new Server({ server: httpsServer }); // Create a WebSocket server instance
	// WebSocketServer.on('connection', onConnectionRequest); // Event handler for new WebSocket connections
	WebSocketServer.on('connection', (socket: WebSocket, req: IncomingMessage) => {
		executeSafely(
			() => onConnectionRequest(socket, req),
			'Error caught within websocket on-connection request:',
		);
	}); // Event handler for new WebSocket connections
}

export default {
	start,
};
