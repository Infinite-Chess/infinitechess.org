// src/server/socket/wsLogger.ts

/**
 * Logs websocket connection handshakes and incoming/outgoing messages.
 * Reflection of reqLogger middleware, but for websockets.
 */

import { logEvents } from '../middleware/logEvents.js';
import socketUtility, { CustomWebSocket } from './socketUtility.js';

/** Additionally logs a newly-opened authenticated socket's metadata into  `wsInLog/. */
function logWebsocketStart(ws: CustomWebSocket): void {
	const socketID = ws.metadata.id;
	const stringifiedSocketMetadata = socketUtility.stringifySocketMetadata(ws);
	const logThis = `Opened socket of ID "${socketID}": ${stringifiedSocketMetadata}`;
	logEvents(logThis, 'wsInLog');
}

/**
 * Logs incoming websocket messages into `wsInLog/`.
 * @param messageData - The raw data of the incoming message.
 */
function logReqWebsocketIn(ws: CustomWebSocket, messageData: string): void {
	const socketID = ws.metadata.id;
	const logThis = `From socket of ID "${socketID}":   ${messageData}`;
	logEvents(logThis, 'wsInLog');
}

/**
 * Logs outgoing websocket messages into `wsOutLog/`.
 * @param messageData - The raw data of the outgoing message.
 */
function logReqWebsocketOut(ws: CustomWebSocket, messageData: string): void {
	const socketID = ws.metadata.id;
	const logThis = `To socket of ID "${socketID}":   ${messageData}`;
	logEvents(logThis, 'wsOutLog');
}

export { logWebsocketStart, logReqWebsocketIn, logReqWebsocketOut };
