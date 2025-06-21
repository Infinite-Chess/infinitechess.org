
/** This script contains our game configurations. */

import docutil from "../util/docutil.js";



/**
 * The version of the game code currently running.
 * If this is old, the server will instruct us to refresh.
 * 
 * THIS SHOULD ALWAYS MATCH src/server/config/config.GAME_VERSION
 */
const GAME_VERSION: string = "1.7"; // The current version of the game

/** Video mode disables the rendering of some items, making making recordings more immersive. */
const VIDEO_MODE: boolean = false;

/**
 * True if the current page is running on a local environment (localhost or local IP).
 * If so, some dev/debugging features are enabled.
 * Also, the main menu background stops moving after 2 seconds instead of 30.
 */
const DEV_BUILD: boolean = docutil.isLocalEnvironment();

export default {
	GAME_VERSION,
	VIDEO_MODE,
	DEV_BUILD
};