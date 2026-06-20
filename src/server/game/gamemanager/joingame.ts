// src/server/game/gamemanager/joingame.ts

/**
 * This script checks if a user belongs to a game, when they send the 'joingame'
 * message, and if so, sends them the game info
 */

import type { Player } from '../../../shared/chess/util/typeutil.js';
import type { ServerGame } from './gameutility.js';
import type { CustomWebSocket } from '../../socket/socketUtility.js';

import gameutility from './gameutility.js';
import liveGameValues from './liveGameValues.js';
import { getGameBySocket } from './gamemanager.js';
import { sendSocketMessage } from '../../socket/sendSocketMessage.js';
import { cancelAutoAFKResignTimer, cancelDisconnectTimer } from './afkdisconnect.js';

/**
 * The method that fires when a client sends the 'joingame' command after refreshing the page.
 * This should fetch any game their in and reconnect them to it.
 * @param ws - Their new websocket
 */
function onJoinGame(ws: CustomWebSocket): void {
	const servergame = getGameBySocket(ws);
	if (!servergame) return; // They don't belong in a game, don't join them in one.

	const colorPlayingAs = gameutility.doesSocketBelongToGame_ReturnColor(servergame.match, ws)!;
	try {
		gameutility.subscribeClientToGame(servergame, ws, colorPlayingAs);
	} catch {
		// DB error (already logged)
		sendSocketMessage(
			ws,
			'game',
			'notifyerror',
			"Couldn't connect to game. A server error occurred. Please refresh.",
		);
		return;
	}

	runReconnectSideEffects(servergame, colorPlayingAs);
}

/**
 * Runs the side-effects of a player (re)attaching their socket to a live game:
 * cancels their auto-AFK-resign timer if it's their turn, clears any disconnect
 * timer, and notifies live-game tracking they reconnected.
 */
function runReconnectSideEffects(servergame: ServerGame, color: Player): void {
	// Cancel the timer that auto loses them by AFK, IF IT is their turn!
	if (servergame.whosTurn === color) {
		const hadAFKTimer = servergame.match.autoAFKResignTime !== undefined;
		cancelAutoAFKResignTimer(servergame, true);
		if (hadAFKTimer) liveGameValues.onPlayerAFKReturn(servergame);
	}
	cancelDisconnectTimer(servergame.match, color);
	liveGameValues.onPlayerReconnected(servergame, color);
}

export { onJoinGame, runReconnectSideEffects };
