
/**
 * This script keeps track of the time the server will be restarting, if it is going to be.
 * This is determined by database/allowinvites.json. Whenever an invite is attempted to be
 * created, the game reads this file to see if we've made a change to it. And if so, inits a server restart.
 * The actual reading is done in src/server/game/invitesmanager
 */

/** The time the server is restarting, if it is, in milliseconds since the Unix Opoch, otherwise false. */
let serverRestartingAt = false;

/**
 * Returns the time the server is restarting at, if it is, in milliseconds since the Unix Opoch, otherwise false.
 * @returns {number}
 */
function getTimeServerRestarting() { return serverRestartingAt }

/**
 * Sets the time the server is restarting at.
 * @param {number} value - The time the server is restarting at in milliseconds since the Unix Opoch.
 */
function setTimeServerRestarting(value) { serverRestartingAt = value }


module.exports = {
    getTimeServerRestarting,
    setTimeServerRestarting
}