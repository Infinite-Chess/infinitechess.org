// src/server/socket/socketserver.ts

import type { Server as HttpsServer } from 'https';

import WebSocket from 'ws';
import { IncomingMessage } from 'http';
import { WebSocketServer as Server } from 'ws';

import { executeSafely } from '../utility/errorguard.js';
import { onConnectionRequest } from './opensocket.js';

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
