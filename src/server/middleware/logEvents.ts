import { format } from 'date-fns';
import { v4 as uuid } from 'uuid';

import { promises as fsPromises } from 'fs';
import path from 'path';

// @ts-ignore
import { getClientIP } from '../utility/IP.js';
import socketUtility, { CustomWebSocket } from '../socket/socketUtility.js';
// @ts-ignore
import { ensureDirectoryExists } from '../utility/fileUtils.js';

import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

import { Request, Response } from "express";

const giveLoggedItemsUUID = false;


/**
 * Logs the provided message by appending a line to the end of the specified log file.
 * @param message - The message to log.
 * @param logName - The name of the log file.
 * @param [options] - Optional parameters.
 * @param [options.print] - If true, prints the message to the console as an error.
 */
async function logEvents(message: string, logName: string, { print = false } = {}) {
	if (typeof message !== 'string') return console.trace("Cannot log message when it is not a string.");
	if (!logName) return console.trace("Log name MUST be provided when logging an event!");

	if (print) console.error(message);
	const dateTime = format(new Date(), 'yyyy/MM/dd  HH:mm:ss');
	const logItem = giveLoggedItemsUUID ? `${dateTime}   ${uuid()}   ${message}\n` // With unique UUID
                                        : `${dateTime}   ${message}\n`;
    
	try {
		const logsPath = path.join(__dirname, '..', '..', '..', 'logs');
		ensureDirectoryExists(logsPath);
		await fsPromises.appendFile(path.join(logsPath, logName), logItem);
	} catch (err) {
		console.log(err);
	}
};

/**
 * Middleware that logs the incoming request, then calls `next()`.
 * @param req - The request object
 * @param res - The response object
 * @param next - The function to call, once finished, to continue down the middleware waterfall.
 */
function logger(req: Request, res: Response, next: () => void) {
	const clientIP = getClientIP(req);

	const origin = req.headers.origin || 'Unknown origin';

	let logThis = `${origin}   ${clientIP}   ${req.method}   ${req.url}   ${req.headers['user-agent']}`;
	// Delete passwords from incoming form data
	let sensoredBody;
	if (JSON.stringify(req.body) !== '{}') { // Not an empty object
		sensoredBody = { ...req.body };
		delete sensoredBody.password;
		delete sensoredBody.username; // Since IP's are logged with each request, If you know a deleted account's username, it can be indirectly traced to their IP if we don't delete them here.
		delete sensoredBody.email;
		logThis += `\n${JSON.stringify(sensoredBody)}`;
	}

	logEvents(logThis, 'reqLog.txt');
    
	next(); // Continue to next middleware
};

/**
 * Logs websocket connection upgrade requests into `wsInLog.txt`
 * @param req - The request object
 * @param ws - The websocket object
 */
function logWebsocketStart(req: Request, ws: CustomWebSocket) {
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
function logReqWebsocketIn(ws: CustomWebSocket, messageData: string) {
	const socketID = ws.metadata.id;
	const logThis = `From socket of ID "${socketID}":   ${messageData}`;
	logEvents(logThis, 'wsInLog.txt');
}

/**
 * Logs outgoing websocket messages into `wsOutLog.txt`
 * @param ws - The websocket object
 * @param messageData - The raw data of the outgoing message, as a string
 */
function logReqWebsocketOut(ws: CustomWebSocket, messageData: string) {
	const socketID = ws.metadata.id;
	const logThis = `To socket of ID "${socketID}":   ${messageData}`;
	logEvents(logThis, 'wsOutLog.txt');
}

export {
	logEvents,
	logger,
	logWebsocketStart,
	logReqWebsocketIn,
	logReqWebsocketOut
};
