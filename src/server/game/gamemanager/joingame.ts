/**
 * This script checks if a user belongs to a game, when they send the 'joingame'
 * message, and if so, sends them the game info
 */

import gameutility from './gameutility.js';
import { cancelAutoAFKResignTimer, cancelDisconnectTimer } from './afkdisconnect.js';
import { getGameBySocket } from './gamemanager.js';

import type { CustomWebSocket } from '../../socket/socketUtility.js';

/**
 * The method that fires when a client sends the 'joingame' command after refreshing the page.
 * This should fetch any game their in and reconnect them to it.
 * @param ws - Their new websocket
 */
function onJoinGame(ws: CustomWebSocket): void {
	const game = getGameBySocket(ws);
	if (!game) return; // They don't belong in a game, don't join them in one.

	const colorPlayingAs = gameutility.doesSocketBelongToGame_ReturnColor(game.match, ws)!;
	gameutility.subscribeClientToGame(game, ws, colorPlayingAs);

	// Cancel the timer that auto loses them by AFK, IF IT is their turn!
	if (game.basegame.whosTurn === colorPlayingAs)
		cancelAutoAFKResignTimer(game.match, true, game.basegame.whosTurn);
	cancelDisconnectTimer(game.match, colorPlayingAs);
}

export { onJoinGame };
