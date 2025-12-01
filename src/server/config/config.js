/**
 * This script contains various server configuration settings.
 *
 * IT MUST remain javascript since build.js imports it, and that must remain javascript
 * as it's what compiles all typescript files into javascript.
 */

import { NODE_ENV } from './env.js';

// Variables -----------------------------------------------------------

/**
 * Whether the server is running in development mode.
 * It will be hosted on a different port for local host,
 * and a few other minor adjustments.
 */
const DEV_BUILD = NODE_ENV === 'development';

/** Whether we are currently rate limiting connections.
 * Only disable temporarily for development purposes. */
const ARE_RATE_LIMITING = !DEV_BUILD || false; // Set to false to temporarily get around it, during development.
if (!DEV_BUILD && !ARE_RATE_LIMITING)
	throw new Error('ARE_RATE_LIMITING must be true in production!!');

/**
 * The amount of latency to add to websocket replies, in millis. ONLY USE IN DEV!!
 * I recommend 2 seconds of latency for testing slow networks.
 */
const simulatedWebsocketLatencyMillis = 0;
// const simulatedWebsocketLatencyMillis = 1000; // 1 Second
// const simulatedWebsocketLatencyMillis = 2000; // 2 Seconds
if (!DEV_BUILD && simulatedWebsocketLatencyMillis !== 0)
	throw new Error('simulatedWebsocketLatencyMillis must be 0 in production!!');

/**
 * The latest version of the game.
 * If the client is ever using an old version, we will tell them to hard-refresh.
 *
 * THIS SHOULD ALWAYS MATCH src/client/scripts/game/config.GAME_VERSION
 */
const GAME_VERSION = '1.8';

/** Whether we are currently using a whitelist for connections from other origins.
 * If we are getting unwanted origins, this can be enabled. */
const useOriginWhitelist = false;
/** The whitelist of allowed origins. Only used if {@link useOriginWhitelist} is true. */
const allowedOrigins = [
	// Allowed sites
	// 'https://www.infinitechess.org', // Is this needed?
	'https://www.google.com',
];

/**
 * The maximum number of logging sessions a user can have at
 * one time before creating new sessions will terminate old sessions.
 */
const sessionCap = 10;

// Unverified Accounts Lifetime -------------------------------------------------------------------------------------------------

/** The maximum time an account is allowed to remain unverified before the server will delete it from DataBase. */
const maxExistenceTimeForUnverifiedAccountMillis = 1000 * 60 * 60 * 24 * 3; // 3 days
// const maxExistenceTimeForUnverifiedAccountMillis = 1000 * 40; // 30 seconds
/** The interval for how frequent to check for unverified account that exists more than `maxExistenceTimeForUnverifiedAccount` */
const intervalForRemovalOfOldUnverifiedAccountsMillis = 1000 * 60 * 60 * 24 * 1; // 1 days
// const intervalForRemovalOfOldUnverifiedAccountsMillis = 1000 * 30; // 30 seconds

// Websockets -------------------------------------------------------------------------------------------------

const printIncomingAndClosingSockets = false;
const printIncomingAndOutgoingMessages = false;

export {
	DEV_BUILD,
	ARE_RATE_LIMITING,
	simulatedWebsocketLatencyMillis,
	GAME_VERSION,
	useOriginWhitelist,
	allowedOrigins,
	sessionCap,
	maxExistenceTimeForUnverifiedAccountMillis,
	intervalForRemovalOfOldUnverifiedAccountsMillis,
	printIncomingAndClosingSockets,
	printIncomingAndOutgoingMessages,
};
