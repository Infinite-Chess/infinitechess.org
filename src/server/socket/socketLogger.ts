// src/server/socket/socketLogger.ts

/**
 * Logs websocket connection handshakes and incoming/outgoing messages.
 * Reflection of reqLogger middleware, but for websockets.
 */

import type { CustomWebSocket } from './socketTypes.js';

import { escapeLogNewlines, logEvents } from '../utility/logEvents.js';

/** Message beyond this length will be truncated in the logs to prevent log bloat.  */
const MAX_LOGGED_MESSAGE_LENGTH = 2048;

/**
 * Truncates a message's contents if it exceeds {@link MAX_LOGGED_MESSAGE_LENGTH},
 * appending a marker noting how many characters were cut.
 */
function truncateMessage(messageData: string): string {
	if (messageData.length <= MAX_LOGGED_MESSAGE_LENGTH) return messageData;
	const omitted = messageData.length - MAX_LOGGED_MESSAGE_LENGTH;
	return `${messageData.slice(0, MAX_LOGGED_MESSAGE_LENGTH)}…[truncated, ${omitted} more chars]`;
}

/** Additionally logs a newly-opened authenticated socket's metadata into  `wsInLog/. */
function logSocketOpen(ws: CustomWebSocket): void {
	const socketID = ws.metadata.id;
	const logThis = `Opened socket of ID "${socketID}": ${JSON.stringify(ws.metadata.memberInfo)}`;
	logEvents(logThis, 'wsInLog');
}

/**
 * Logs incoming websocket messages into `wsInLog/`.
 * @param messageData - The raw data of the incoming message.
 */
function logSocketIn(ws: CustomWebSocket, messageData: string): void {
	const socketID = ws.metadata.id;
	const logThis = `From socket of ID "${socketID}":   ${escapeLogNewlines(truncateMessage(messageData))}`;
	logEvents(logThis, 'wsInLog');
}

/**
 * Logs outgoing websocket messages into `wsOutLog/`.
 * @param messageData - The raw data of the outgoing message.
 */
function logSocketOut(ws: CustomWebSocket, messageData: string): void {
	const socketID = ws.metadata.id;
	const logThis = `To socket of ID "${socketID}":   ${truncateMessage(messageData)}`;
	logEvents(logThis, 'wsOutLog');
}

export { logSocketOpen, logSocketIn, logSocketOut };
