// src/server/socket/socketLogger.ts

/**
 * Logs websocket connection handshakes and incoming/outgoing messages.
 * Reflection of reqLogger middleware, but for websockets.
 */

import type { CustomWebSocket } from './socketTypes.js';

import logEvents from '../utility/logEvents.js';

// Functions -------------------------------------------------------------------

/** Logs a newly-opened socket's metadata into `wsInLog`. */
function logOpen(ws: CustomWebSocket): void {
	const socketID = ws.metadata.id;
	const logThis = `Opened socket of ID "${socketID}": ${JSON.stringify(ws.metadata.memberInfo)}`;
	logEvents.add(logThis, 'wsInLog');
}

/**
 * Logs incoming websocket messages into `wsInLog/`.
 * @param messageData - The raw data of the incoming message.
 */
function logIn(ws: CustomWebSocket, messageData: string): void {
	const socketID = ws.metadata.id;
	const logThis = `From socket of ID "${socketID}":   ${logEvents.escapeUntrusted(messageData)}`;
	logEvents.add(logThis, 'wsInLog');
}

/**
 * Logs outgoing websocket messages into `wsOutLog/`.
 * @param messageData - The raw data of the outgoing message.
 */
function logOut(ws: CustomWebSocket, messageData: string): void {
	const socketID = ws.metadata.id;
	const logThis = `To socket of ID "${socketID}":   ${logEvents.truncate(messageData)}`;
	logEvents.add(logThis, 'wsOutLog');
}

// Exports ---------------------------------------------------------------------

export default { logOpen, logIn, logOut };
