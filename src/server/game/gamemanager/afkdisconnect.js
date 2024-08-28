
/**
 * The script handles the setting, resetting, and cancellation
 * of both the auto resign timer when players go AFK in online games,
 * and the disconnection timer when they leave the page / lose internet.
 */

// Custom imports

import gameutility from './gameutility.js';
import math1 from '../math1.js';
import movesscript1 from '../movesscript1.js';

// Type imports
/** @typedef {import('../TypeDefinitions.js').Game} Game */

//--------------------------------------------------------------------------------------------------------

/**
 * The time to give players who disconnected not by choice
 * (network interruption) to reconnect to the game before
 * we tell their opponent they've disconnected, and start an auto-resign timer.
 */
const timeToGiveDisconnectedBeforeStartingAutoResignTimerMillis = 1000 * 5; // 5 seconds

/**
 * The duration of the auto-resign timer by disconnect, when the player
 * has intentionally left the page.
 */
const timeBeforeAutoResignByDisconnectMillis = 1000 * 20; // 20 seconds
/**
 * The duration of the auto-resign timer by disconnect (more forgiving),
 * when the player's internet cuts out.
 */
const timeBeforeAutoResignByDisconnectMillis_NotByChoice = 1000 * 60; // 60 seconds

//--------------------------------------------------------------------------------------------------------

/**
 * Cancels the timer that automatically resigns a player due to being AFK (Away From Keyboard).
 * This function should be called when the "AFK-Return" websocket action is received, indicating
 * that the player has returned, OR when a client refreshes the page!
 * @param {Game} game - The game
 * @param {Object} [options] - Optional parameters.
 * @param {boolean} [options.alertOpponent=false] - Whether to notify the opponent that the player has returned. This will cause their client to cease counting down the time until their opponent is auto-resigned.
 */
function cancelAutoAFKResignTimer(game, { alertOpponent } = {}) {
    if (gameutility.isAFKTimerActive(game) && alertOpponent) { // Alert their opponent
        const opponentColor = math1.getOppositeColor(game.whosTurn);
        gameutility.sendMessageToSocketOfColor(game, opponentColor, 'game', 'opponentafkreturn');
    }

    clearTimeout(game.autoAFKResignTimeoutID);
    game.autoAFKResignTimeoutID = undefined;
    game.autoAFKResignTime = undefined;
}

//--------------------------------------------------------------------------------------------------------

/**
 * Starts a timer to auto-resign a player from disconnection.
 * @param {Game} game - The game
 * @param {string} color - The color to start the auto-resign timer for
 * @param {boolean} closureNotByChoice - True if the player didn't close the connection on purpose.
 * @param {Function} onAutoResignFunc - The function to call when the player should be auto resigned from disconnection. This should have 2 arguments: The game, and the color that won.
 */
function startDisconnectTimer(game, color, closureNotByChoice, onAutoResignFunc) {
    // console.log(`Starting disconnect timer to auto resign player ${color}.`)

    const now = Date.now();
    const resignable = movesscript1.isGameResignable(game);

    let timeBeforeAutoResign = closureNotByChoice && resignable ? timeBeforeAutoResignByDisconnectMillis_NotByChoice : timeBeforeAutoResignByDisconnectMillis;
    // console.log(`Time before auto resign: ${timeBeforeAutoResign}`)
    let timeToAutoLoss = now + timeBeforeAutoResign;

    // Is there an afk timer already running for them?
    // If so, delete it, transferring it's time remaining to this disconnect timer.
    // We can do this because if player is disconnected, they are afk anyway.
    // And if if they reconnect, then they're not afk anymore either.
    if (game.whosTurn === color && gameutility.isAFKTimerActive(game)) {
        if (game.autoAFKResignTime > timeToAutoLoss) console.error("The time to auto-resign by AFK should not be greater than time to auto-resign by disconnect. We shouldn't be overwriting the AFK timer.");
        timeToAutoLoss = game.autoAFKResignTime;
        timeBeforeAutoResign = timeToAutoLoss - now;
        cancelAutoAFKResignTimer(game);
    }

    const opponentColor = math1.getOppositeColor(color);

    game.disconnect.autoResign[color].timeoutID = setTimeout(onAutoResignFunc, timeBeforeAutoResign, game, opponentColor);
    game.disconnect.autoResign[color].timeToAutoLoss = timeToAutoLoss;
    game.disconnect.autoResign[color].wasByChoice = !closureNotByChoice;

    // Alert their opponent the time their opponent will be auto-resigned by disconnection.
    const value = { autoDisconnectResignTime: timeToAutoLoss, wasByChoice: !closureNotByChoice };
    gameutility.sendMessageToSocketOfColor(game, opponentColor, 'game', 'opponentdisconnect', value);
}

/**
 * Cancels both players timers to auto-resign them from disconnection if they were disconnected.
 * Typically called when a game ends.
 * @param {Game} game - The game
 */
function cancelDisconnectTimers(game) {
    cancelDisconnectTimer(game, 'white', { dontNotifyOpponent: true });
    cancelDisconnectTimer(game, 'black', { dontNotifyOpponent: true });
}

/**
 * Cancels the player's timer to auto-resign them from disconnection if they were disconnected.
 * This is called when they reconnect/refresh.
 * @param {Game} game - The game
 * @param {string} color - The color to cancel the timer for
 */
function cancelDisconnectTimer(game, color, { dontNotifyOpponent } = {}) {
    // console.log(`Canceling disconnect timer for player ${color}!`)

    /** Whether the timer (not the cushion to start the timer) for auto-resigning is RUNNING! */
    const autoResignTimerWasRunning = gameutility.isAutoResignDisconnectTimerActiveForColor(game, color);
    
    clearTimeout(game.disconnect.startTimer[color]);
    clearTimeout(game.disconnect.autoResign[color].timeoutID);
    game.disconnect.startTimer[color] = undefined;
    game.disconnect.autoResign[color].timeoutID = undefined;
    game.disconnect.autoResign[color].timeToAutoLoss = undefined;
    game.disconnect.autoResign[color].wasByChoice = undefined;
    
    if (dontNotifyOpponent) return;

    // Alert their opponent their opponent has returned...

    if (!autoResignTimerWasRunning) return; // Opponent was never notified their opponent was afk, skip telling them their opponent has returned.

    const opponentColor = math1.getOppositeColor(color);
    gameutility.sendMessageToSocketOfColor(game, opponentColor, 'game', 'opponentdisconnectreturn');
}

//--------------------------------------------------------------------------------------------------------

/**
 * Returns the cushion, in millis, that we give disconnected players to reconnect before we start an auto-resign timer.
 * @returns {number}
 */
function getDisconnectionForgivenessDuration() { return timeToGiveDisconnectedBeforeStartingAutoResignTimerMillis; }


export {
    cancelAutoAFKResignTimer,
    startDisconnectTimer,
    cancelDisconnectTimers,
    cancelDisconnectTimer,
    getDisconnectionForgivenessDuration
};