import { WebSocketServer as Server } from 'ws';

import { executeSafely } from '../utility/errorGuard.js';
import { onConnectionRequest } from './openSocket.js';



let WebSocketServer;



function start(httpsServer) {
	WebSocketServer = new Server({ server: httpsServer }); // Create a WebSocket server instance
	// WebSocketServer.on('connection', onConnectionRequest); // Event handler for new WebSocket connections
	WebSocketServer.on('connection', (ws, req) => {
		executeSafely(onConnectionRequest, 'Error caught within websocket on-connection request:', ws, req);
	}); // Event handler for new WebSocket connections
}



export default {
	start,
};
