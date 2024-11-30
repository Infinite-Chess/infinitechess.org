
/**
 * Whether to run the server in development mode.
 * It will be hosted on a different port for local host,
 * and a few other minor adjustments.
 * Disable in production.
 */
const DEV_BUILD = true;

/** 
 * Whether we bundle and minify files to send to the client
 * Only disable for debugging and development
 */
const BUNDLE_FILES = !DEV_BUILD || false; // Change false to true to always enable.
if (!DEV_BUILD && !BUNDLE_FILES) throw new Error("BUNDLE_FILES must be true in production!!");

/** Whether we are currently rate limiting connections.
 * Only disable temporarily for development purposes. */
const ARE_RATE_LIMITING = !DEV_BUILD || false; // Set to false to temporarily get around it, during development.
if (!DEV_BUILD && !ARE_RATE_LIMITING) throw new Error("ARE_RATE_LIMITING must be true in production!!");

/** 
 * The amount of latency to add to websocket replies, in millis. ONLY USE IN DEV!!
 * I recommend 2 seconds of latency for testing slow networks.
 */
const simulatedWebsocketLatencyMillis = 0;
// const simulatedWebsocketLatencyMillis = 1000; // 1 Second
if (!DEV_BUILD && simulatedWebsocketLatencyMillis !== 0) throw new Error("simulatedWebsocketLatencyMillis must be 0 in production!!");

/** The domain name of the production website. */
const HOST_NAME = 'www.infinitechess.org';

/**
 * The latest version of the game.
 * If the client is ever using an old version, we will tell them to hard-refresh.
 * 
 * THIS SHOULD ALWAYS MATCH src/client/scripts/game/config.GAME_VERSION
 */
const GAME_VERSION = "1.5";

/** Whether we are currently using a whitelist for connections from other origins.
 * If we are getting unwanted origins, this can be enabled. */
const useOriginWhitelist = false;
/** The whitelist of allowed origins. Only used if {@link useOriginWhitelist} is true. */
const allowedOrigins = [ // Allowed sites
    // 'https://www.infinitechess.org', // Is this needed?
    'https://www.google.com'
];

// Session tokens expiry times ------------------------------------------------------

const refreshTokenExpiryMillis = 1000 * 60 * 60 * 24 * 5; // 5 days
// const refreshTokenExpiryMillis = 1000 * 60 * 2; // 2m
const minTimeToWaitToRenewRefreshTokensMillis = 1000 * 60 * 60 * 24; // 1 day
// const minTimeToWaitToRenewRefreshTokensMillis = 1000 * 30; // 30s
const accessTokenExpiryMillis = 1000 * 60 * 15; // 15 minutes

const intervalForRefreshTokenCleanupMillis = 1000 * 60 * 60 * 24; // 1 day
// const intervalForRefreshTokenCleanupMillis = 1000 * 30; // 30s


// Unverified Accounts Lifetime -------------------------------------------------------------------------------------------------


/** The maximum time an account is allowed to remain unverified before the server will delete it from DataBase. */
const maxExistenceTimeForUnverifiedAccountMillis = 1000 * 60 * 60 * 24 * 3; // 3 days
// const maxExistenceTimeForUnverifiedAccountMillis = 1000 * 40; // 30 seconds
/** The interval for how frequent to check for unverified account that exists more than `maxExistenceTimeForUnverifiedAccount` */
const intervalForRemovalOfOldUnverifiedAccountsMillis = 1000 * 60 * 60 * 24 * 1; // 1 days
// const intervalForRemovalOfOldUnverifiedAccountsMillis = 1000 * 30; // 30 seconds



export {
	DEV_BUILD,
	BUNDLE_FILES,
	ARE_RATE_LIMITING,
	simulatedWebsocketLatencyMillis,
	HOST_NAME,
	GAME_VERSION,
	useOriginWhitelist,
	allowedOrigins,
	refreshTokenExpiryMillis,
	minTimeToWaitToRenewRefreshTokensMillis,
	accessTokenExpiryMillis,
	intervalForRefreshTokenCleanupMillis,
	maxExistenceTimeForUnverifiedAccountMillis,
	intervalForRemovalOfOldUnverifiedAccountsMillis,
};