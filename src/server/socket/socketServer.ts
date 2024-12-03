
import { WebSocketServer as Server } from 'ws';
import { IncomingMessage } from 'http';

// Custom imports...

import WebSocket from 'ws';

import { onConnectionRequest } from './openSocket.js';
// @ts-ignore
import { executeSafely } from '../utility/errorGuard.js';

// Type Definitions...

import type { Server as HttpsServer } from 'https';



let WebSocketServer: WebSocket.Server;



function start(httpsServer: HttpsServer) {
	WebSocketServer = new Server({ server: httpsServer }); // Create a WebSocket server instance
	// WebSocketServer.on('connection', onConnectionRequest); // Event handler for new WebSocket connections
	WebSocketServer.on('connection', (socket: WebSocket, req: IncomingMessage) => {
		executeSafely(onConnectionRequest, 'Error caught within websocket on-connection request:', socket, req);
	}); // Event handler for new WebSocket connections
}



export default {
	start,
};
