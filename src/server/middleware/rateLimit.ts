// src/server/middleware/rateLimit.ts

import type { IncomingMessage } from 'node:http';
import type { Request, Response, NextFunction } from 'express';
import type { CustomWebSocket } from '../socket/socketUtility.js';

import jsutil from '../../shared/util/jsutil.js';

import { isIPBanned } from './banned.js';
import { getClientIP } from '../utility/IP.js';
import { logEvents, logEventsAndPrint } from './logEvents.js';

import 'dotenv/config'; // Imports all properties of process.env, if it exists

/**
 * Whether the server is running in development mode.
 * It will be hosted on a different port for local host,
 * and a few other minor adjustments.
 */
const DEV_BUILD = process.env['NODE_ENV'] === 'development';

/** Whether we are currently rate limiting connections.
 * Only disable temporarily for development purposes. */
const ARE_RATE_LIMITING = !DEV_BUILD; // Set to false to temporarily get around it, during development.
if (!DEV_BUILD && !ARE_RATE_LIMITING) {
	throw new Error('ARE_RATE_LIMITING must be true in production!!');
}

// For rate limiting a client...

/** The maximum number of requests/messages allowed per IP address, per minute. */
const maxRequestsPerMinute = process.env['NODE_ENV'] === 'development' ? 400 : 200; // Default: 400 / 200
const minuteInMillis = 60000;

/**
 * Interval to clear out an agent's list of recent connection timestamps if they
 * are longer ago than {@link minuteInMillis}
 */
const rateToUpdateRecentConnections = 1000; // 1 Second

/**
 * The object containing a combination of IP addresses and user agents for the key,
 * and for the value - an array of timestamps of their recent connections.
 * The key format will be `{ "192.538.1.1|User-Agent-String": [timestamp1, timestamp2, ...] }`
 */
const rateLimitHash: Record<string, number[]> = {};

// For detecting if we're under a DDOS attack...

/** Interval to check if we think we're experiencing a DDOS */
const requestWindowToToggleAttackModeMillis = 2000;
/**
 * The number of requests we can receive in our {@link requestWindowToToggleAttackModeMillis}
 * before thinking there's a DDOS attack happening.
 */
const requestCapToToggleAttackMode = 200;

/**
 * Whether we think we're currently experiencing a DDOS.
 * When true, in the future we can strictly limit what actions users can request/perform!
 *
 * Ideas:
 * 1. All htmls, or statically served file items, should only be served once per minute to each IP.
 * 2. Don't rate limit player's websocket messages who are currently in a game.
 * 3. Temporarily disallow account creation.
 */
let underAttackMode = false;

/**
 * An ordered array of timestamps of recent connections,
 * up to {@link requestWindowToToggleAttackModeMillis} ago.
 * The length of this is how many total requests we have
 * received during the past {@link requestWindowToToggleAttackModeMillis}.
 */
const recentRequests: number[] = []; // List of times of recent connections

/**
 * Generates a key for rate limiting based on the client's IP address and user agent.
 * @param IP - The IP address of the request or websocket connection.
 * @param userAgent - The user agent string from the request headers.
 * @returns The combined key in the format "IP|User-Agent" or null if IP cannot be determined
 */
function getIpBrowserAgentKey(IP: string, userAgent: string): string {
	// Construct the key combining IP and user agent
	return `${IP}|${userAgent}`;
}

/**
 * Middleware that counts this IP address's recent connections,
 * and rejects this request if they've sent too many.
 * @param req - The request object
 * @param res - The response object
 * @param next - The function to call, when finished, to continue the middleware waterfall.
 */
function rateLimit(req: Request, res: Response, next: NextFunction): void {
	if (!ARE_RATE_LIMITING) return next(); // Not rate limiting

	countRecentRequests();

	const clientIP = getClientIP(req);
	if (!clientIP) {
		logEvents(
			'Unable to identify client IP address when rate limiting!',
			'reqLogRateLimited.txt',
		);
		res.status(400).json({ message: 'Unable to identify client IP address' });
		return;
	}

	if (isIPBanned(clientIP)) {
		const logThis = `Banned IP ${clientIP} tried to connect! ${req.headers.origin}   ${clientIP}   ${req.method}   ${req.url}   ${req.headers['user-agent']}`;
		logEvents(logThis, 'bannedIPLog.txt');
		res.status(403).json({ message: 'You are banned' });
		return;
	}

	const userAgent = req.headers['user-agent'];
	if (!userAgent) {
		logEvents(
			`Unable to identify user agent for IP ${clientIP} when rate limiting!`,
			'reqLogRateLimited.txt',
		);
		res.status(400).json({ message: 'User agent is required' });
		return;
	}

	const userKey = getIpBrowserAgentKey(clientIP, userAgent);

	// Add the current timestamp to their list of recent connection timestamps.
	incrementClientConnectionCount(userKey);

	const timestamps = rateLimitHash[userKey];
	if (timestamps && timestamps.length > maxRequestsPerMinute) {
		// Rate limit them (too many requests sent)
		logEvents(
			`Agent ${userKey} has too many requests! Count: ${timestamps.length}`,
			'reqLogRateLimited.txt',
		);
		res.status(429).json({ message: 'Too Many Requests. Try again soon.' });
		return;
	}

	next(); // Continue the middleware waterfall
}

/**
 * Counts this IP address's recent connections,
 * and returns false if they've sent too many requests/messages.
 * @param req - The request object
 * @param ws - The websocket object
 * @returns false if they've sent too many requests/messages. THEY WILL HAVE ALREADY BEEN CLOSED
 */
function rateLimitWebSocket(req: IncomingMessage, ws: CustomWebSocket): boolean {
	countRecentRequests();

	const userAgent = req.headers['user-agent'];
	if (!userAgent) {
		logEvents(
			`Unable to identify user agent for websocket connection when rate limiting!`,
			'reqLogRateLimited.txt',
		);
		ws.close(1008, 'User agent is required');
		return false;
	}

	const userKey = getIpBrowserAgentKey(ws.metadata.IP, userAgent);

	// Add the current timestamp to their list of recent connection timestamps.
	incrementClientConnectionCount(userKey);

	if (rateLimitHash[userKey]!.length > maxRequestsPerMinute) {
		logEvents(
			`Agent ${userKey} has too many requests after! Count: ${rateLimitHash[userKey]!.length}`,
			'reqLogRateLimited.txt',
		);
		ws.close(1009, 'Too Many Requests. Try again soon.');
		return false;
	}

	return true; // Connection allowed!
}

/**
 * Increment the provided user key's recent connection count by adding the current timestamp
 * to their list of recent connection timestamps.
 * Only call if we haven't already rejected them for too many requests.
 * @param userKey - The unique key combining IP address and user agent.
 */
function incrementClientConnectionCount(userKey: string): void {
	// Initialize the array if it doesn't exist
	if (!rateLimitHash[userKey]) rateLimitHash[userKey] = [];
	// Add the current timestamp to the user's recent connection timestamp list
	rateLimitHash[userKey]!.push(Date.now());
}

/**
 * Set an interval to periodically clear {@link rateLimitHash}
 * of IP addresses with no recent connections or outdated timestamps.
 */
setInterval(() => {
	const currentTimeMillis = Date.now();

	for (const [key, timestamps] of Object.entries(rateLimitHash)) {
		const firstTimestamp = timestamps[0];

		// Check if there are no timestamps
		if (firstTimestamp === undefined) {
			const logMessage =
				'Agent recent connection timestamp list was empty. This should never happen! It should have been deleted.';
			logEventsAndPrint(logMessage, 'errLog.txt');
			delete rateLimitHash[key];
			continue;
		}

		// Check the first timestamp. If the first timestamp is within the valid window, skip processing
		if (currentTimeMillis - firstTimestamp <= minuteInMillis) continue;

		// If all timestamps are older, delete the key
		const mostRecentTimestamp = timestamps.at(-1)!;
		if (currentTimeMillis - mostRecentTimestamp >= minuteInMillis) {
			delete rateLimitHash[key];
			continue;
		}

		// Use binary search to find the index to split at
		const indexToSplitAt = jsutil.findIndexOfPointInOrganizedArray(
			timestamps,
			currentTimeMillis - minuteInMillis,
		);

		// Remove all timestamps to the left of the found index
		timestamps.splice(0, indexToSplitAt);
		if (timestamps.length === 0) delete rateLimitHash[key];
	}
}, rateToUpdateRecentConnections);

/**
 * Adds the current timestamp to {@link recentRequests}.
 * This should always be called with any request/message,
 * EVEN if they are rate limited.
 */
function countRecentRequests(): void {
	const currentTimeMillis = Date.now();
	recentRequests.push(currentTimeMillis);
}

/**
 * Set an interval to repeatedly strip {@link recentRequests}
 * of timestamps that are longer than {@link requestWindowToToggleAttackModeMillis} ago.
 * This uses binary search to quickly find the splice point, so that
 * we don't potentially have to check hundreds of timestamps.
 *
 * This also activates {@link underAttackMode} if it thinks we have had SO
 * many recent connections that it must be a DDOS attack.
 */
setInterval(() => {
	// Delete recent requests longer than 2 seconds ago
	const twoSecondsAgo = Date.now() - requestWindowToToggleAttackModeMillis;
	const indexToSplitAt = jsutil.findIndexOfPointInOrganizedArray(recentRequests, twoSecondsAgo);
	recentRequests.splice(0, indexToSplitAt + 1);

	if (recentRequests.length > requestCapToToggleAttackMode) {
		if (!underAttackMode) {
			// Toggle on
			underAttackMode = true;
			logAttackBegin();
		}
	} else if (underAttackMode) {
		underAttackMode = false;
		logAttackEnd();
	}
}, requestWindowToToggleAttackModeMillis);

function logAttackBegin(): void {
	const logText = `Probable DDOS attack happening now. Initial recent request count: ${recentRequests.length}`;
	logEventsAndPrint(logText, 'reqLogRateLimited.txt');
	logEventsAndPrint(logText, 'hackLog.txt');
}

function logAttackEnd(): void {
	const logText = `DDOS attack has ended.`;
	logEventsAndPrint(logText, 'reqLogRateLimited.txt');
	logEventsAndPrint(logText, 'hackLog.txt');
}

export { rateLimit, rateLimitWebSocket };
