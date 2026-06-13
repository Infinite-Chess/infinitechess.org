// src/server/socket/wsLogger.ts

/**
 * Logs websocket connection handshakes and incoming/outgoing messages.
 * Reflection of reqLogger middleware, but for websockets.
 */

import type { IncomingMessage } from 'node:http';

import { logEvents } from '../middleware/logEvents.js';
import socketUtility, { CustomWebSocket } from './socketUtility.js';

/**
 * Logs websocket connection upgrade requests into `wsInLog/`.
 * @param req - The request object
 * @param ws - The websocket object
 */
function logWebsocketStart(req: IncomingMessage, ws: CustomWebSocket): void {
	const socketID = ws.metadata.id;
	const stringifiedSocketMetadata = socketUtility.stringifySocketMetadata(ws);
	const userAgent = req.headers['user-agent'];
	const logThis = `Opened socket of ID "${socketID}": ${stringifiedSocketMetadata}   User agent: ${userAgent}`;
	logEvents(logThis, 'wsInLog');
}

/**
 * Logs incoming websocket messages into `wsInLog/`.
 * @param ws - The websocket object
 * @param messageData - The raw data of the incoming message, as a string
 */
function logReqWebsocketIn(ws: CustomWebSocket, messageData: string): void {
	const socketID = ws.metadata.id;
	const logThis = `From socket of ID "${socketID}":   ${messageData}`;
	logEvents(logThis, 'wsInLog');
}

/**
 * Logs outgoing websocket messages into `wsOutLog/`.
 * @param ws - The websocket object
 * @param messageData - The raw data of the outgoing message, as a string
 */
function logReqWebsocketOut(ws: CustomWebSocket, messageData: string): void {
	const socketID = ws.metadata.id;
	const logThis = `To socket of ID "${socketID}":   ${messageData}`;
	logEvents(logThis, 'wsOutLog');
}

export { logWebsocketStart, logReqWebsocketIn, logReqWebsocketOut };
