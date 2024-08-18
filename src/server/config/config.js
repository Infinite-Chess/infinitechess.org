
/**
 * Whether to run the server in development mode.
 * It will be hosted on a different port for local host,
 * and a few other minor adjustments.
 * Disable in production.
 */
const DEV_BUILD = true;

/** Whether we are currently rate limiting connections.
 * Only disable temporarily for development purposes. */
const ARE_RATE_LIMITING = true; // Set to false to temporarily get around it, during development.

/** 
 * The amount of latency to add to websocket replies, in millis. ONLY USE IN DEV!!
 * I recommend 2 seconds of latency for testing slow networks.
 */
const simulatedWebsocketLatencyMillis = 0;
if (!DEV_BUILD && simulatedWebsocketLatencyMillis !== 0) throw new Error("simulatedWebsocketLatencyMillis must be 0 in production!!");



/** The domain name of the production website. */
const HOST_NAME = 'www.infinitechess.org';

/**
 * The latest version of the game.
 * If the client is ever using an old version, we will tell them to hard-refresh.
 * 
 * THIS SHOULD ALWAYS MATCH protected-owner/scripts/game/main/GAME_VERSION
 */
const GAME_VERSION = "1.4";

/** Whether we are currently using a whitelist for connections from other origins.
 * If we are getting unwanted origins, this can be enabled. */
const useOriginWhitelist = false;
/** The whitelist of allowed origins. Only used if {@link useOriginWhitelist} is true. */
const allowedOrigins = [ // Allowed sites
    // 'https://www.infinitechess.org', // Is this needed?
    'https://www.google.com'
];

module.exports = {
    DEV_BUILD,
    ARE_RATE_LIMITING,
    simulatedWebsocketLatencyMillis,
    HOST_NAME,
    GAME_VERSION,
    useOriginWhitelist,
    allowedOrigins
};