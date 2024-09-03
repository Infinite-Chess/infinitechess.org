import docutil from "./misc/docutil.js";

/** This script contains our game configurations. */
const config = (function() {

    /**
     * The version of the game code currently running.
     * If this is old, the server will instruct us to refresh.
     * 
     * THIS SHOULD ALWAYS MATCH src/server/config/config.GAME_VERSION
     */
    const GAME_VERSION = "1.4"; // The current version of the game

    /** Video mode disables the rendering of some items, making making recordings more immersive. */
    const VIDEO_MODE = false;

    /**
     * true if the current page is running on a local environment (localhost or local IP).
     * If so, some dev/debugging features are enabled.
     * Also, the main menu background stops moving after 2 seconds instead of 30.
     */
    const DEV_BUILD = docutil.isLocalEnvironment();

    
    return Object.freeze({
        GAME_VERSION,
        VIDEO_MODE,
        DEV_BUILD
    });

})();

export default config;