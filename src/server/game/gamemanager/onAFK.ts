/**
 * The script handles the route when users inform us they have gone AFK or returned from being AFK.
 */

// Custom imports
import { onPlayerLostByAbandonment } from './gamemanager.js';
import { cancelAutoAFKResignTimer } from './afkdisconnect.js';
import gameutility from './gameutility.js';
import typeutil from '../../../shared/chess/util/typeutil.js';

import type { CustomWebSocket } from '../../socket/socketUtility.js';
import type { ServerGame } from './gameutility.js';

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
 * @param game - The game they are in.
 */
function onAFK(ws: CustomWebSocket, servergame: ServerGame): void {
	const { match, basegame } = servergame;

	// console.log("Client alerted us they are AFK.")
	const color = gameutility.doesSocketBelongToGame_ReturnColor(match, ws)!;

	if (gameutility.isGameOver(basegame))
		return console.error(
			'Client submitted they are afk when the game is already over. Ignoring.',
		);

	// Verify it's their turn (can't lose by afk if not)
	if (basegame.whosTurn !== color)
		return console.error("Client submitted they are afk when it's not their turn. Ignoring.");

	if (!basegame.untimed && gameutility.isGameResignable(basegame))
		return console.error(
			'Client submitted they are afk in a timed, resignable game. There is no afk auto-resign timers in timed games anymore.',
		);

	if (
		match.playerData[color]!.disconnect.startID !== undefined ||
		match.playerData[color]!.disconnect.timeToAutoLoss !== undefined
	) {
		return console.error(
			"Player's disconnect timer should have been cancelled before starting their afk timer!",
		);
	}

	const opponentColor = typeutil.invertPlayer(color);

	// Start a 20s timer to auto terminate the game by abandonment.
	match.autoAFKResignTimeoutID = setTimeout(
		onPlayerLostByAbandonment,
		durationOfAutoResignTimerMillis,
		servergame,
		opponentColor,
	); // The auto resign function should have 2 arguments: The game, and the color that won.
	match.autoAFKResignTime = Date.now() + durationOfAutoResignTimerMillis;

	// Alert their opponent
	const value = { millisUntilAutoAFKResign: durationOfAutoResignTimerMillis };
	gameutility.sendMessageToSocketOfColor(match, opponentColor, 'game', 'opponentafk', value);
}

/**
 * Called when a client alerts us they have returned from being AFK.
 * Alerts their opponent, and cancels the timer to auto-resign.
 * @param ws - The socket
 * @param game - The game they are in.
 */
function onAFK_Return(ws: CustomWebSocket, { match, basegame }: ServerGame): void {
	// console.log("Client alerted us they no longer AFK.")
	const color = gameutility.doesSocketBelongToGame_ReturnColor(match, ws);

	if (gameutility.isGameOver(basegame))
		return console.error(
			'Client submitted they are back from being afk when the game is already over. Ignoring.',
		);

	// Verify it's their turn (can't lose by afk if not)
	if (basegame.whosTurn !== color)
		return console.error(
			"Client submitted they are back from being afk when it's not their turn. Ignoring.",
		);

	if (!basegame.untimed && gameutility.isGameResignable(basegame))
		return console.error(
			'Client submitted they are back from being afk in a timed, resignable game. There is no afk auto-resign timers in timed games anymore.',
		);

	cancelAutoAFKResignTimer(match, true, basegame.whosTurn);
}

export { onAFK, onAFK_Return };
