
/**
 * The script handles the route when users inform us they have gone AFK or returned from being AFK.
 */

// Custom imports
import gameutility from './gameutility.js';
import { onPlayerLostByAbandonment, getGameBySocket } from './gamemanager.js';
import { cancelAutoAFKResignTimer } from './afkdisconnect.js';
import typeutil from '../../../client/scripts/esm/chess/util/typeutil.js';

import type { CustomWebSocket } from '../../socket/socketUtility.js';

//--------------------------------------------------------------------------------------------------------

/**
 * The length of the timer to auto resign somebody by being AFK/disconnected for too long.
 * This cannot change because the client is hard coded to play a low-time sound on timer start,
 * and a unique 10 second countdown at 10 seconds remaining.
 * Plus, they are the ones who tell us when they are AFK. This does not include the by default
 * 40-second pretimer they are allowed to be AFK before this 20s timer starts.
 */
const durationOfAutoResignTimerMillis = 1000 * 20; // 20 seconds. 



/**
 * Called when a client alerts us they have gone AFK.
 * Alerts their opponent, and starts a timer to auto-resign.
 * @param ws - The socket
 */
function onAFK(ws: CustomWebSocket): void {
	// console.log("Client alerted us they are AFK.")
	const game = getGameBySocket(ws);
	if (!game) return console.error("Client submitted they are afk when they don't belong in a game.");
	const color = gameutility.doesSocketBelongToGame_ReturnColor(game, ws)!;

	if (gameutility.isGameOver(game)) return console.error("Client submitted they are afk when the game is already over. Ignoring.");

	// Verify it's their turn (can't lose by afk if not)
	if (game.whosTurn !== color) return console.error("Client submitted they are afk when it's not their turn. Ignoring.");

	if (!game.untimed && gameutility.isGameResignable(game)) return console.error("Client submitted they are afk in a timed, resignable game. There is no afk auto-resign timers in timed games anymore.");
    
	if (game.players[color]!.disconnect.startID !== undefined || game.players[color]!.disconnect.timeToAutoLoss !== undefined) {
		return console.error("Player's disconnect timer should have been cancelled before starting their afk timer!");
	}

	const opponentColor = typeutil.invertPlayer(color);

	// Start a 20s timer to auto terminate the game by abandonment.
	game.autoAFKResignTimeoutID = setTimeout(onPlayerLostByAbandonment, durationOfAutoResignTimerMillis, game, opponentColor); // The auto resign function should have 2 arguments: The game, and the color that won.
	game.autoAFKResignTime = Date.now() + durationOfAutoResignTimerMillis;

	// Alert their opponent
	const value = { millisUntilAutoAFKResign: durationOfAutoResignTimerMillis };
	gameutility.sendMessageToSocketOfColor(game, opponentColor, 'game', 'opponentafk', value);
}

/**
 * Called when a client alerts us they have returned from being AFK.
 * Alerts their opponent, and cancels the timer to auto-resign.
 * @param ws - The socket
 */
function onAFK_Return(ws: CustomWebSocket): void {
	// console.log("Client alerted us they no longer AFK.")
	const game = getGameBySocket(ws);
	if (!game) return console.error("Client submitted they are back from being afk when they don't belong in a game.");
	const color = gameutility.doesSocketBelongToGame_ReturnColor(game, ws);

	if (gameutility.isGameOver(game)) return console.error("Client submitted they are back from being afk when the game is already over. Ignoring.");

	// Verify it's their turn (can't lose by afk if not)
	if (game.whosTurn !== color) return console.error("Client submitted they are back from being afk when it's not their turn. Ignoring.");

	if (!game.untimed && gameutility.isGameResignable(game)) return console.error("Client submitted they are back from being afk in a timed, resignable game. There is no afk auto-resign timers in timed games anymore.");

	cancelAutoAFKResignTimer(game, { alertOpponent: true });
}

export {
	onAFK,
	onAFK_Return
};