// src/server/utility/requestMeter.ts

/**
 * Request-metering engine shared by the HTTP rate limiter (middleware/rateLimit.ts)
 * and the websocket pipeline (socketOpen.ts / socketReceive.ts): records recent
 * request volume for DDOS detection, and meters each client (IP + user-agent)
 * against a per-minute cap.
 *
 * Transport-agnostic on purpose: adapters decide how to reject a throttled client —
 * this module never touches requests, responses or sockets.
 */

import jsutil from '../../shared/util/jsutil.js';

import { logEventsAndPrint } from './logEvents.js';

// Constants -------------------------------------------------------------------------------------

/** The maximum number of requests/messages allowed per client, per minute. */
const MAX_REQUESTS_PER_MINUTE = process.env['NODE_ENV'] === 'development' ? 400 : 200; // Default: 400 / 200

/** How often expired entries are cleared out of {@link rateLimitHash}. */
const RATE_UPDATE_INTERVAL_MS = 1000; // 1 second

/** The window of recent request volume periodically checked for DDOS-scale traffic. */
const ATTACK_WINDOW_MS = 2000;

/**
 * The number of requests receivable within {@link ATTACK_WINDOW_MS}
 * before we think there's a DDOS attack happening.
 */
const ATTACK_WINDOW_REQUEST_CAP = 200;

const MINUTE_MS = 60000;

// State ----------------------------------------------------------------------------------------

/**
 * The timestamps of each client's recent requests, keyed by `"IP|User-Agent"`.
 * A list's length is how many requests that client has made within the past
 * {@link MINUTE_MS}. Swept by an interval below.
 */
const rateLimitHash: Record<string, number[]> = {};

/**
 * An ordered list of timestamps of every recent request received, up to
 * {@link ATTACK_WINDOW_MS} ago. Its length is the total request volume during
 * that window, watched for DDOS-scale spikes.
 */
const recentRequests: number[] = [];

/** Whether we think we're currently experiencing a DDOS. If true, 429 errors never render html, returning a plain json/string instead. */
let underAttackMode = false;

// Recording -------------------------------------------------------------------------------------

/**
 * Adds the current timestamp to {@link recentRequests}.
 * This should always be called with any request/message,
 * EVEN if they are rate limited.
 */
function recordRecent(): void {
	recentRequests.push(Date.now());
}

// Metering --------------------------------------------------------------------------------------

/**
 * Records a connection attempt from a client and checks it against their per-minute cap.
 * @param IP - The IP address of the client.
 * @param userAgent - The client's user agent string.
 * @returns The minimum number of seconds until the client may make a successful
 *          request again (rolling window), or undefined if they're under the cap.
 */
function meter(IP: string, userAgent: string): number | undefined {
	// Construct the key combining IP address and user agent: "IP|User-Agent"
	const userKey = `${IP}|${userAgent}`;

	// Add the current timestamp to their list of recent connection timestamps.
	if (!rateLimitHash[userKey]) rateLimitHash[userKey] = [];
	rateLimitHash[userKey]!.push(Date.now());

	const timestamps = rateLimitHash[userKey]!;
	if (timestamps.length > MAX_REQUESTS_PER_MINUTE) {
		// Rate limited (too many requests sent)
		return getRetryAfterSeconds(timestamps);
	}

	return undefined; // Under the cap
}

/**
 * Returns the minimum number of seconds until a client who was just rate limited could make a
 * successful request again, ASSUMING they make no further requests until then (rolling window).
 * @param timestamps - The client's recent connection timestamps (length is already over the cap).
 */
function getRetryAfterSeconds(timestamps: number[]): number {
	const index = timestamps.length - MAX_REQUESTS_PER_MINUTE;
	const retryAfterMillis = timestamps[index]! + MINUTE_MS - Date.now();
	return Math.max(1, Math.ceil(retryAfterMillis / 1000));
}

/** Periodically clears {@link rateLimitHash} of clients whose every timestamp is older than {@link MINUTE_MS}. */
setInterval(() => {
	const currentTimeMillis = Date.now();

	for (const [key, timestamps] of Object.entries(rateLimitHash)) {
		const firstTimestamp = timestamps[0];

		// Check if there are no timestamps
		if (firstTimestamp === undefined) {
			const logMessage =
				'Agent recent connection timestamp list was empty. This should never happen! It should have been deleted.';
			logEventsAndPrint(logMessage, 'errLog');
			delete rateLimitHash[key];
			continue;
		}

		// Check the first timestamp. If the first timestamp is within the valid window, skip processing
		if (currentTimeMillis - firstTimestamp <= MINUTE_MS) continue;

		// If all timestamps are older, delete the key
		const mostRecentTimestamp = timestamps.at(-1)!;
		if (currentTimeMillis - mostRecentTimestamp >= MINUTE_MS) {
			delete rateLimitHash[key];
			continue;
		}

		// Use binary search to find the index to split at
		const indexToSplitAt = jsutil.findIndexOfPointInOrganizedArray(
			timestamps,
			currentTimeMillis - MINUTE_MS,
		);

		// Remove all timestamps to the left of the found index
		timestamps.splice(0, indexToSplitAt);
		if (timestamps.length === 0) delete rateLimitHash[key];
	}
}, RATE_UPDATE_INTERVAL_MS);

// Attack-mode watchdog --------------------------------------------------------------------------

/** Whether we currently believe traffic is DDOS-scale. */
function isUnderAttack(): boolean {
	return underAttackMode;
}

/**
 * Periodically strips {@link recentRequests} of timestamps longer than
 * {@link ATTACK_WINDOW_MS} ago. Uses binary search to quickly find the splice
 * point, so we don't potentially have to check hundreds of timestamps.
 *
 * This also toggles {@link underAttackMode} if it thinks we have had SO many recent
 * connections that it must be a DDOS attack.
 */
setInterval(() => {
	// Delete recent requests longer than the attack window ago
	const windowStart = Date.now() - ATTACK_WINDOW_MS;
	const indexToSplitAt = jsutil.findIndexOfPointInOrganizedArray(recentRequests, windowStart);
	recentRequests.splice(0, indexToSplitAt + 1);

	if (recentRequests.length > ATTACK_WINDOW_REQUEST_CAP) {
		if (!underAttackMode) {
			// Toggle on
			underAttackMode = true;
			logAttackBegin();
		}
	} else if (underAttackMode) {
		underAttackMode = false;
		logAttackEnd();
	}
}, ATTACK_WINDOW_MS);

function logAttackBegin(): void {
	const logText = `Probable DDOS attack happening now. Initial recent request count: ${recentRequests.length}`;
	logEventsAndPrint(logText, 'hackLog');
}

function logAttackEnd(): void {
	const logText = `DDOS attack has ended.`;
	logEventsAndPrint(logText, 'hackLog');
}

// Exports ---------------------------------------------------------------------------------------

export default {
	// Recording
	recordRecent,
	// Metering
	meter,
	// Attack-mode watchdog
	isUnderAttack,
};
