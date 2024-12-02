import { WebSocketServer as Server } from 'ws';

import { executeSafely } from '../utility/errorGuard.js';
import { onConnectionRequest } from './openSocket.js';

import type WebSocket from 'ws';
import { IncomingMessage } from 'http';



let WebSocketServer: WebSocket.Server;



function start(httpsServer) {
	WebSocketServer = new Server({ server: httpsServer }); // Create a WebSocket server instance
	// WebSocketServer.on('connection', onConnectionRequest); // Event handler for new WebSocket connections
	WebSocketServer.on('connection', (socket: WebSocket, req: IncomingMessage) => {
		executeSafely(onConnectionRequest, 'Error caught within websocket on-connection request:', socket, req);
	}); // Event handler for new WebSocket connections
}



export default {
	start,
};
