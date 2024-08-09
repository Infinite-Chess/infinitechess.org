
/**
 * The script handles the setting, resetting, and cancellation
 * of both the auto resign timer when players go AFK in online games,
 * and the disconnection timer when they leave the page / lose internet.
 */

// Custom imports
const { Socket, Game } = require('./TypeDefinitions')
const game1 = require('./game1');
const wsutility = require('./wsutility');
const math1 = require('./math1')
const movesscript1 = require('./movesscript1');

//--------------------------------------------------------------------------------------------------------

/**
 * The length of the timer to auto resign somebody by being AFK/disconnected for too long.
 * This cannot change because the client is hard coded to play a low-time sound on timer start,
 * and a unique 10 second countdown at 10 seconds remaining.
 * Plus, they are the ones who tell us when they are AFK. This does not include the by default
 * 40-second pretimer they are allowed to be AFK before this 20s timer starts.
 */
const durationOfAutoResignTimerMillis = 1000 * 20; // 20 seconds. 

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
 * Called when a client alerts us they have gone AFK.
 * Alerts their opponent, and starts a timer to auto-resign.
 * @param {Socket} ws - The socket
 * @param {Game} game - The game they belong in, if they belong in one.
 * @param {Function} onAutoResignFunc - The function to call when the player should be auto resigned by being AFK. This should have 2 arguments: The game, and the color that won.
 */
function onAFK(ws, game, onAutoResignFunc) {
    // console.log("Client alerted us they are AFK.")

    if (!game) return console.error("Client submitted they are afk when they don't belong in a game.")
    const color = game1.doesSocketBelongToGame_ReturnColor(game, ws);

    if (game1.isGameOver(game)) return console.error("Client submitted they are afk when the game is already over. Ignoring.")

    // Verify it's their turn (can't lose by afk if not)
    if (game.whosTurn !== color) return console.error("Client submitted they are afk when it's not their turn. Ignoring.")
    
    if (isDisconnectTimerActiveForColor(game, color)) return console.error("Player's disconnect timer should have been cancelled before starting their afk timer!")

    const opponentColor = math1.getOppositeColor(color);

    // Start a 20s timer to auto terminate the game by abandonment.
    game.autoAFKResignTimeoutID = setTimeout(onAutoResignFunc, durationOfAutoResignTimerMillis, game, opponentColor) // The auto resign function should have 2 arguments: The game, and the color that won.
    game.autoAFKResignTime = Date.now() + durationOfAutoResignTimerMillis;

    // Alert their opponent
    const value = { autoAFKResignTime: game.autoAFKResignTime }
    game1.sendMessageToSocketOfColor(game, opponentColor, 'game', 'opponentafk', value)
}

/**
 * Called when a client alerts us they have returned from being AFK.
 * Alerts their opponent, and cancels the timer to auto-resign.
 * @param {Socket} ws - The socket
 * @param {Game} game - The game they belong in, if they belong in one.
 */
function onAFK_Return(ws, game) {
    // console.log("Client alerted us they no longer AFK.")

    if (!game) return console.error("Client submitted they are back from being afk when they don't belong in a game.")
    const color = game1.doesSocketBelongToGame_ReturnColor(game, ws);

    if (game1.isGameOver(game)) return console.error("Client submitted they are back from being afk when the game is already over. Ignoring.")

    // Verify it's their turn (can't lose by afk if not)
    if (game.whosTurn !== color) return console.error("Client submitted they are back from being afk when it's not their turn. Ignoring.")

    cancelAutoAFKResignTimer(game, { alertOpponent: true });
}

//--------------------------------------------------------------------------------------------------------

/**
 * Returns true if the color whos turn it is has an AFK
 * timer to auto-resign them from being AFK for too long.
 * @param {Game} game - The game
 */
function isAFKTimerActive(game) {
    // If this is defined, then the timer is defined.
    return game.autoAFKResignTime != null;
}

/**
 * Cancels the timer that automatically resigns a player due to being AFK (Away From Keyboard).
 * This function should be called when the "AFK-Return" websocket action is received, indicating that the player has returned.
 * @param {Game} game - The game
 * @param {Object} [options] - Optional parameters.
 * @param {boolean} [options.alertOpponent=false] - Whether to notify the opponent that the player has returned. This will cause their client to cease counting down the time until their opponent is auto-resigned.
 */
function cancelAutoAFKResignTimer(game, { alertOpponent } = {}) {
    if (isAFKTimerActive(game) && alertOpponent) { // Alert their opponent
        const opponentColor = math1.getOppositeColor(game.whosTurn);
        game1.sendMessageToSocketOfColor(game, opponentColor, 'game', 'opponentafkreturn')
    }

    clearTimeout(game.autoAFKResignTimeoutID)
    game.autoAFKResignTimeoutID = undefined;
    game.autoAFKResignTime = undefined;
}

//--------------------------------------------------------------------------------------------------------

/**
 * Flags, or sets a timer to, the socket as disconnected. Alerts their opponent. This does NOT unsub them from the game.
 * @param {Socket} ws - Their websocket
 * @param {Game} game - The game they belong in, if they belong to one.
 * @param {Function} onAutoResignFunc - The function to call when the player should be auto resigned from disconnection.This should have 2 arguments: The game, and the color that won.
 * @param {Object} options - An object that contains the property `closureNotByChoice`, that when true,
 * will give them 5 seconds to reconnect before flagging them as disconnected.
 */
function onSocketClosure2(ws, game, onAutoResignFunc, { closureNotByChoice = true } = {}) {
    if (!game) return console.error("Cannot find game socket was in, cannot start timer to auto resign them.")

    // Quit if the game is over already
    if (game1.isGameOver(game)) return;

    const color = game1.doesSocketBelongToGame_ReturnColor(game, ws);

    if (closureNotByChoice) {
        // Their connection/internet dropped. Give them 5 seconds
        // before flagging them as disconnected, informing their opponent
        // they lost connection, and starting a 60s auto resign timer.
        console.log("Waiting 5 seconds before starting disconnection timer.")
        game.disconnect.startTimer[color] = setTimeout(startDisconnectTimer, timeToGiveDisconnectedBeforeStartingAutoResignTimerMillis, game, color, closureNotByChoice, onAutoResignFunc)
    } else {
        // Closed the tab manually. Immediately flag them
        // as disconnected, start a 20s auto resign timer.
        startDisconnectTimer(game, color, closureNotByChoice, onAutoResignFunc)
    }
}

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
    if (game.whosTurn === color && game.autoAFKResignTime != null) {
        if (game.autoAFKResignTime > timeToAutoLoss) console.error("The time to auto-resign by AFK should not be greater than time to auto-resign by disconnect. We shouldn't be overwriting the AFK timer.")
        timeToAutoLoss = game.autoAFKResignTime;
        timeBeforeAutoResign = timeToAutoLoss - now;
        cancelAutoAFKResignTimer(game);
    }

    const opponentColor = math1.getOppositeColor(color);

    game.disconnect.autoResign[color].timeoutID = setTimeout(onAutoResignFunc, timeBeforeAutoResign, game, opponentColor);
    game.disconnect.autoResign[color].timeToAutoLoss = timeToAutoLoss;
    game.disconnect.autoResign[color].wasByChoice = !closureNotByChoice;

    // Alert their opponent the time their opponent will be auto-resigned by disconnection.
    const value = { autoDisconnectResignTime: timeToAutoLoss, wasByChoice: !closureNotByChoice }
    game1.sendMessageToSocketOfColor(game, opponentColor, 'game', 'opponentdisconnect', value)
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
 * Cancels the player's auto-resign them from disconnection if they were disconnected.
 * This is called when they reconnect/refresh.
 * @param {Game} game - The game
 * @param {string} color - The color to cancel the timer for
 */
function cancelDisconnectTimer(game, color, { dontNotifyOpponent } = {}) {
    // console.log(`Canceling disconnect timer for player ${color}!`)
    
    clearTimeout(game.disconnect.startTimer[color])
    clearTimeout(game.disconnect.autoResign[color].timeoutID)
    game.disconnect.startTimer[color] = undefined;
    game.disconnect.autoResign[color].timeoutID = undefined;
    game.disconnect.autoResign[color].timeToAutoLoss = undefined;
    game.disconnect.autoResign[color].wasByChoice = undefined;
    
    if (dontNotifyOpponent) return;

    // Alert their opponent their opponent has returned...

    const opponentColor = math1.getOppositeColor(color);
    game1.sendMessageToSocketOfColor(game, opponentColor, 'game', 'opponentdisconnectreturn')
}

//--------------------------------------------------------------------------------------------------------

/**
 * Returns true if the provided color has a disconnect
 * timer to auto-resign them from being gone for too long.
 * @param {Game} game - The game they're in
 * @param {string} color - The color they are in this game
 */
function isDisconnectTimerActiveForColor(game, color) {
    // If these are defined, then the timer is defined.
    return game.disconnect.startTimer[color] != null || game.disconnect.autoResign[color].timeToAutoLoss != null;
}



module.exports = {
    onAFK,
    onAFK_Return,
    cancelAutoAFKResignTimer,
    onSocketClosure2,
    startDisconnectTimer,
    cancelDisconnectTimers,
    cancelDisconnectTimer
}