
/**
 * This script only stores the number of active games,
 * that is games that are not over (falsey gameConclusion).
 * 
 * Games that have ended are retained for a short period of time
 * to allow disconnected players to reconnect and see the results.
 */


const { broadcastToAllInviteSubs } = require("../invitesmanager/invitessubscribers");


/** The number of currently active (not over) games. */
let activeGameCount = 0;


/** Call when a game is created. */
function incrementActiveGameCount() {
    activeGameCount++;
    // Game count increment is already broadcasted automatically
    // in the invitesmanager when an invite is accepted.
}

/** Call when a game ENDS (not necessarily deleted). */
function decrementActiveGameCount() {
    activeGameCount--;
    broadcastGameCountToInviteSubs();
}

/** Broadcasts the current game count to all sockets subscribed to the invites list. */
function broadcastGameCountToInviteSubs() {
    broadcastToAllInviteSubs("gamecount", activeGameCount);
}

/**
 * Returns the active game count. This is the number of active games that are not yet over.
 * Games that have ended are retained for a short period of time
 * to allow disconnected players to reconnect and see the results.
 * @returns {number} The active game count
 */
function getActiveGameCount() {
    return activeGameCount;
}

/** Prints the active game count to the console. */
function printActiveGameCount() {
    const activeGameCount = getActiveGameCount();
    console.log(`Active games: ${activeGameCount} ===========================================`);
}


module.exports = {
    incrementActiveGameCount,
    decrementActiveGameCount,
    getActiveGameCount,
    printActiveGameCount,
    broadcastGameCountToInviteSubs,
};