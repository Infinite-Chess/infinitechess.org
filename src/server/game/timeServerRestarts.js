
/**
 * This script keeps track of the time the server will be restarting, if it is going to be.
 * This is determined by database/allowinvites.json. Whenever an invite is attempted to be
 * created, the game reads this file to see if we've made a change to it. And if so, inits a server restart.
 * The actual reading is done in src/server/game/updateServerRestart.js
 */


/** The time the server is restarting, if it is, in milliseconds after the Unix Opoch, otherwise false. @type {number | false} */
let serverRestartingAt = false;


/**
 * Returns the time the server is restarting at, if it is, in milliseconds after the Unix Opoch, otherwise false.
 * @returns {number | false}
 */
function getTimeServerRestarting() { return serverRestartingAt }

/**
 * Sets the time the server is restarting at, in milliseconds after the Unix Opoch.
 * @param {number}
 */
function setTimeServerRestarting(value) { serverRestartingAt = value; }

/** Cancel the server restart by setting the restart time to false */
function cancelServerRestart() { serverRestartingAt = false; }

/**
 * Calculates the number of minutes, rounded up, the server will restart in,
 * if it is restarting. It does not restart automatically, but we manually do so.
 * The script just keeps track of the time we *plan* on restarting.
 * @returns {number | undefined} Minutes until restart, rounded up, or undefined if we're not restarting.
 */
function getMinutesUntilServerRestart() {
    if (!serverRestartingAt) return; // Not restarting

    const now = Date.now(); // Current time in milliseconds
    const millisLeft = serverRestartingAt - now;

    const minutesLeft = millisLeft / (1000 * 60)
    const ceiled = Math.ceil(minutesLeft)
    const returnThis = ceiled > 0 ? ceiled : 0;

    return returnThis; // Convert to minutes
}


module.exports = {
    getTimeServerRestarting,
    setTimeServerRestarting,
    cancelServerRestart,
    getMinutesUntilServerRestart
}