// src/server/middleware/logEvents.ts

import type { IncomingMessage } from 'node:http';
import type { Request, Response } from 'express';

import fs from 'fs';
import path from 'path';
import { format } from 'date-fns';
import { v4 as uuid } from 'uuid';
import { promises as fsPromises } from 'fs';

import paths from '../config/paths.js';
import { getClientIP } from '../utility/IP.js';
import socketUtility, { CustomWebSocket } from '../socket/socketUtility.js';

const giveLoggedItemsUUID = false;

/**
 * Logs the provided message by appending a line to the end of the specified log file.
 * @param message - The message to log.
 * @param logName - The name of the log file.
 */
async function logEvents(message: string, logName: string): Promise<void> {
	if (typeof message !== 'string')
		return console.trace('Cannot log message when it is not a string.');
	if (!logName) return console.trace('Log name MUST be provided when logging an event!');

	const dateTime = format(new Date(), 'yyyy/MM/dd  HH:mm:ss');
	const logItem = giveLoggedItemsUUID
		? `${dateTime}   ${uuid()}   ${message}\n` // With unique UUID
		: `${dateTime}   ${message}\n`;

	try {
		fs.mkdirSync(paths.LOGS_DIR, { recursive: true });
		await fsPromises.appendFile(path.join(paths.LOGS_DIR, logName), logItem);
	} catch (err: unknown) {
		console.error('Error logging event:', err);
	}
}

/**
 * Logs the provided message by appending a line to the end of the specified log file,
 * and prints it to the console as an error.
 * @param message - The message to log.
 * @param logName - The name of the log file.
 */
async function logEventsAndPrint(message: string, logName: string): Promise<void> {
	if (logName === 'errLog.txt') console.error(message);
	else console.log(message); // Prevents non error logs from going to PM2's error logs.

	await logEvents(message, logName);
}

/** Middleware that logs the incoming request, then calls `next()`. */
function reqLogger(req: Request, res: Response, next: () => void): void {
	const clientIP = getClientIP(req) || 'Unknown ip';

	const origin = req.headers.origin || 'Unknown origin';

	// Redact sensitive tokens that appear in URL paths so they are never written to log files.
	const sanitizedUrl = req.url
		.replace(/(\/reset-password\/)([^?#/]+)/, '$1[REDACTED]')
		.replace(/(\/verify\/[^/]+\/)([^?#/]+)/, '$1[REDACTED]')
		.replace(/([?&]username=)[^&#]+/, '$1[REDACTED]'); // Redact usernames (e.g. the availability check's ?username=)

	// Bodies are high-PII and left out
	const logThis = `${origin}   ${clientIP}   ${req.method}   ${sanitizedUrl}   ${req.headers['user-agent']}`;

	logEvents(logThis, 'reqLog.txt');

	next(); // Continue to next middleware
}

/**
 * Logs websocket connection upgrade requests into `wsInLog.txt`
 * @param req - The request object
 * @param ws - The websocket object
 */
function logWebsocketStart(req: IncomingMessage, ws: CustomWebSocket): void {
	const socketID = ws.metadata.id;
	const stringifiedSocketMetadata = socketUtility.stringifySocketMetadata(ws);
	const userAgent = req.headers['user-agent'];
	// const userAgent = ws.metadata.userAgent;
	const logThis = `Opened socket of ID "${socketID}": ${stringifiedSocketMetadata}   User agent: ${userAgent}`;
	logEvents(logThis, 'wsInLog.txt');
}

/**
 * Logs incoming websocket messages into `wsInLog.txt`
 * @param ws - The websocket object
 * @param messageData - The raw data of the incoming message, as a string
 */
function logReqWebsocketIn(ws: CustomWebSocket, messageData: string): void {
	const socketID = ws.metadata.id;
	const logThis = `From socket of ID "${socketID}":   ${messageData}`;
	logEvents(logThis, 'wsInLog.txt');
}

/**
 * Logs outgoing websocket messages into `wsOutLog.txt`
 * @param ws - The websocket object
 * @param messageData - The raw data of the outgoing message, as a string
 */
function logReqWebsocketOut(ws: CustomWebSocket, messageData: string): void {
	const socketID = ws.metadata.id;
	const logThis = `To socket of ID "${socketID}":   ${messageData}`;
	logEvents(logThis, 'wsOutLog.txt');
}

export {
	logEvents,
	logEventsAndPrint,
	reqLogger,
	logWebsocketStart,
	logReqWebsocketIn,
	logReqWebsocketOut,
};
