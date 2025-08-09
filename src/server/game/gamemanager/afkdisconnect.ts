
/**
 * The script handles the setting, resetting, and cancellation
 * of both the auto resign timer when players go AFK in online games,
 * and the disconnection timer when they leave the page / lose internet.
 */

// Custom imports

import gameutility from './gameutility.js';
import typeutil from '../../../client/scripts/esm/chess/util/typeutil.js';

// Type imports
import type { Game } from './gameutility.js';
import type { Player } from '../../../client/scripts/esm/chess/util/typeutil.js';

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
 * @param game - The game
 * @param options.alertOpponent - Whether to notify the opponent that the player has returned. This will cause their client to cease counting down the time until their opponent is auto-resigned. [false]
 */
function cancelAutoAFKResignTimer(game: Game, { alertOpponent = false } = {}) {
	if (game.autoAFKResignTime !== undefined && alertOpponent) { // Alert their opponent
		const opponentColor = typeutil.invertPlayer(game.whosTurn!);
		gameutility.sendMessageToSocketOfColor(game, opponentColor, 'game', 'opponentafkreturn');
	}

	clearTimeout(game.autoAFKResignTimeoutID);
	game.autoAFKResignTimeoutID = undefined;
	game.autoAFKResignTime = undefined;
}

//--------------------------------------------------------------------------------------------------------

/**
 * Starts a timer to auto-resign a player from disconnection.
 * @param game - The game
 * @param color - The color to start the auto-resign timer for
 * @param closureNotByChoice - True if the player didn't close the connection on purpose.
 * @param onAutoResignFunc - The function to call when the player should be auto resigned from disconnection. This should have 2 arguments: The game, and the color that won.
 */
// eslint-disable-next-line no-unused-vars
function startDisconnectTimer(game: Game, color: Player, closureNotByChoice: boolean, onAutoResignFunc: (game: Game, winner: Player) => void) {
	console.log(`Starting disconnect timer to auto resign player ${color}.`);

	const now = Date.now();
	const resignable = gameutility.isGameResignable(game);

	let timeBeforeAutoResign = closureNotByChoice && resignable ? timeBeforeAutoResignByDisconnectMillis_NotByChoice : timeBeforeAutoResignByDisconnectMillis;
	// console.log(`Time before auto resign: ${timeBeforeAutoResign}`)
	let timeToAutoLoss = now + timeBeforeAutoResign;

	// Is there an afk timer already running for them?
	// If so, delete it, transferring it's time remaining to this disconnect timer.
	// We can do this because if player is disconnected, they are afk anyway.
	// And if if they reconnect, then they're not afk anymore either.
	if (game.whosTurn === color && game.autoAFKResignTime !== undefined) {
		if (game.autoAFKResignTime > timeToAutoLoss) console.error("The time to auto-resign by AFK should not be greater than time to auto-resign by disconnect. We shouldn't be overwriting the AFK timer.");
		timeToAutoLoss = game.autoAFKResignTime;
		timeBeforeAutoResign = timeToAutoLoss - now;
		cancelAutoAFKResignTimer(game);
	}

	const playerdata = game.players[color]!;
	const opponentColor = typeutil.invertPlayer(color);

	playerdata.disconnect.timeoutID = setTimeout(() => onAutoResignFunc(game, opponentColor), timeBeforeAutoResign);
	playerdata.disconnect.timeToAutoLoss = timeToAutoLoss;
	playerdata.disconnect.wasByChoice = !closureNotByChoice;

	
	// Alert their opponent the time their opponent will be auto-resigned by disconnection.
	const value = { millisUntilAutoDisconnectResign: timeBeforeAutoResign, wasByChoice: !closureNotByChoice };
	gameutility.sendMessageToSocketOfColor(game, opponentColor, 'game', 'opponentdisconnect', value);
}

/**
 * Cancels both players timers to auto-resign them from disconnection if they were disconnected.
 * Typically called when a game ends.
 * @param game - The game
 */
function cancelDisconnectTimers(game: Game) {
	for (const color of Object.keys(game.players)) {
		cancelDisconnectTimer(game, Number(color) as Player, { dontNotifyOpponent: true });
	}
}

/**
 * Cancels the player's timer to auto-resign them from disconnection if they were disconnected.
 * This is called when they reconnect/refresh.
 * @param game - The game
 * @param color - The color to cancel the timer for
 */
function cancelDisconnectTimer(game: Game, color: Player, { dontNotifyOpponent = false } = {}) {
	// console.log(`Canceling disconnect timer for player ${color}!`)

	/** Whether the timer (not the cushion to start the timer) for auto-resigning is RUNNING! */
	const autoResignTimerWasRunning = gameutility.isAutoResignDisconnectTimerActiveForColor(game, color);
    
	const playerdata = game.players[color]!;

	clearTimeout(playerdata.disconnect.startID);
	clearTimeout(playerdata.disconnect.timeoutID);
	playerdata.disconnect.startID = undefined;
	playerdata.disconnect.timeoutID = undefined;
	playerdata.disconnect.timeToAutoLoss = undefined;
	playerdata.disconnect.wasByChoice = undefined;
    
	if (dontNotifyOpponent) return;

	// Alert their opponent their opponent has returned...

	if (!autoResignTimerWasRunning) return; // Opponent was never notified their opponent was afk, skip telling them their opponent has returned.

	const opponentColor = typeutil.invertPlayer(color);
	gameutility.sendMessageToSocketOfColor(game, opponentColor, 'game', 'opponentdisconnectreturn');
}

//--------------------------------------------------------------------------------------------------------

/**
 * Returns the cushion, in millis, that we give disconnected players to reconnect before we start an auto-resign timer.
 */
function getDisconnectionForgivenessDuration(): number { return timeToGiveDisconnectedBeforeStartingAutoResignTimerMillis; }


export {
	cancelAutoAFKResignTimer,
	startDisconnectTimer,
	cancelDisconnectTimers,
	cancelDisconnectTimer,
	getDisconnectionForgivenessDuration
};