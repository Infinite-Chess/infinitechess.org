import { logEvents } from './logEvents.js';
import { getClientIP } from '../utility/IP.js';

import { isIPBanned } from './banned.js';
import { DEV_BUILD, ARE_RATE_LIMITING } from '../config/config.js';
import { getTranslationForReq } from '../utility/translate.js';
import jsutil from '../../client/scripts/esm/util/jsutil.js';

/** @typedef {import('../socket/socketUtility.js').CustomWebSocket} CustomWebSocket */

// For rate limiting a client...

/** The maximum number of requests/messages allowed per IP address, per minute. */
const maxRequestsPerMinute = DEV_BUILD ? 400 : 200; // Default: 400 / 200
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
const rateLimitHash = {};


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
 * `[ 521521521, 521521578 ]`
 */
const recentRequests = []; // List of times of recent connections

/**
 * The maximum size of an incoming websocket message, in bytes.
 * Above this will be rejected, and an error sent to the client.
 */
const maxWebsocketMessageSizeBytes = 100_000; // 100 megabytes



/**
 * Generates a key for rate limiting based on the client's IP address and user agent.
 * @param {Object} req - The request object
 * @param {CustomWebSocket} ws - The websocket object, IF it is a websocket connection!
 * @returns {string|null} The combined key in the format "IP|User-Agent" or null if IP cannot be determined
 */
function getIpBrowserAgentKey(req, ws) {
	const clientIP = ws ? ws.metadata.IP : getClientIP(req); // Get the client IP address
	const userAgent = req.headers['user-agent']; // Get the user agent string

	if (!clientIP) return null; // Return null if IP is not found

	// Construct the key combining IP and user agent
	return `${clientIP}|${userAgent}`;
}

/**
 * Middleware that counts this IP address's recent connections,
 * and rejects this request if they've sent too many.
 * @param {Object} req - The request object
 * @param {Object} res - The response object
 * @param {Function} next - The function to call, when finished, to continue the middleware waterfall.
 */
function rateLimit(req, res, next) {
	if (!ARE_RATE_LIMITING) return next(); // Not rate limiting
    
	countRecentRequests();

	const clientIP = getClientIP(req);
	if (!clientIP) {
		logEvents('Unable to identify client IP address when rate limiting!', 'hackLog.txt');
		return res.status(500).json({ message: getTranslationForReq("server.javascript.ws-unable_to_identify_client_ip", req) });
	}

	if (isIPBanned(clientIP)) {
		const logThis = `Banned IP ${clientIP} tried to connect! ${req.headers.origin}   ${clientIP}   ${req.method}   ${req.url}   ${req.headers['user-agent']}`;
		logEvents(logThis, 'bannedIPLog.txt');
		return res.status(403).json({ message: getTranslationForReq("server.javascript.ws-you_are_banned_by_server", req) });
	}

	const userKey = getIpBrowserAgentKey(req); // By this point their IP is defined so this will be defined.

	// Add the current timestamp to their list of recent connection timestamps.
	incrementClientConnectionCount(userKey);

	if (rateLimitHash[userKey].length > maxRequestsPerMinute) { // Rate limit them (too many requests sent)
		logEvents(`Agent ${userKey} has too many requests! Count: ${rateLimitHash[userKey].length}`, 'hackLog.txt');
		return res.status(429).json({ message: getTranslationForReq("server.javascript.ws-too_many_requests_to_server", req) });
	}

	next(); // Continue the middleware waterfall
}

// Returns true if the connection is allowed. False if too many.

/**
 * Counts this IP address's recent connections,
 * and returns false if they've sent too many requests/messages.
 * @param {Object} req - The request object
 * @param {CustomWebSocket} ws - The websocket object
 * @returns {boolean} false if they've sent too many requests/messages. THEY WILL HAVE ALREADY BEEN CLOSED
 */
function rateLimitWebSocket(req, ws) {

	countRecentRequests();

	const userKey = getIpBrowserAgentKey(req, ws); // By this point their IP is defined so this will be defined.

	// Add the current timestamp to their list of recent connection timestamps.
	incrementClientConnectionCount(userKey);

	if (rateLimitHash[userKey].length > maxRequestsPerMinute) {
		logEvents(`Agent ${userKey} has too many requests! Count: ${rateLimitHash[userKey].length}`, 'hackLog.txt');
		ws.close(1009, 'Too Many Requests. Try again soon.');
		return false;
	}

	// Test if the message is too big here. People could DDOS this way
	// THIS MAY NOT WORK if the bytes get read before we reach this part of the code, it could still DDOS us before we reject them.
	// Then again.. Unless their initial http websocket upgrade request contains a massive amount of bytes, this will immediately reject them anyway!
	const messageSize = ws._socket.bytesRead;
	if (messageSize > maxWebsocketMessageSizeBytes) {
		logEvents(`Agent ${userKey} sent too big a websocket message.`, 'hackLog.txt');
		ws.close(1009, 'Message Too Big');
		return false;
	}

	return true; // Connection allowed!
}

/**
 * Increment the provided user key's recent connection count by adding the current timestamp
 * to their list of recent connection timestamps.
 * Only call if we haven't already rejected them for too many requests.
 * @param {string} userKey - The unique key combining IP address and user agent.
 */
function incrementClientConnectionCount(userKey) {
	// Initialize the array if it doesn't exist
	if (!rateLimitHash[userKey]) rateLimitHash[userKey] = [];
	// Add the current timestamp to the user's recent connection timestamp list
	rateLimitHash[userKey].push(Date.now());
}

/**
 * Set an interval to periodically clear {@link rateLimitHash}
 * of IP addresses with no recent connections or outdated timestamps.
 */
setInterval(() => {
	const hashKeys = Object.keys(rateLimitHash);
	const currentTimeMillis = Date.now();

	for (const key of hashKeys) {
		const timestamps = rateLimitHash[key];

		// Check if there are no timestamps
		if (timestamps.length === 0) {
			const logMessage = "Agent recent connection timestamp list was empty. This should never happen! It should have been deleted.";
			logEvents(logMessage, 'errLog.txt', { print: true });
			delete rateLimitHash[key];
			continue;
		}

		// Check the first timestamp. If the first timestamp is within the valid window, skip processing
		const firstTimestamp = timestamps[0];
		if (currentTimeMillis - firstTimestamp <= minuteInMillis) continue;

		// If all timestamps are older, delete the key
		const mostRecentTimestamp = timestamps[timestamps.length - 1];
		if (currentTimeMillis - mostRecentTimestamp >= minuteInMillis) {
			delete rateLimitHash[key];
			continue;
		}

		// Use binary search to find the index to split at
		const indexToSplitAt = jsutil.findIndexOfPointInOrganizedArray(timestamps, currentTimeMillis - minuteInMillis);

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
function countRecentRequests() {
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
		if (!underAttackMode) { // Toggle on
			underAttackMode = true;
			logAttackBegin();
		}
	} else if (underAttackMode) {
		underAttackMode = false;
		logAttackEnd();
	}
}, requestWindowToToggleAttackModeMillis);

function logAttackBegin() {
	const logText = `Probable DDOS attack happening now. Initial recent request count: ${recentRequests.length}`;
	logEvents(logText, 'hackLog.txt', { print: true });
}

function logAttackEnd() {
	const logText = `DDOS attack has ended.`;
	logEvents(logText, 'hackLog.txt', { print: true });
}

export {
	rateLimit,
	rateLimitWebSocket
};