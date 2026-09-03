// src/server/game/gamemanager/gameRouter.ts

/**
 * Routes every incoming websocket message on the "game" route to its handler.
 *
 * See docs/systems/WEBSOCKETS.md.
 */

import type { CustomWebSocket } from '../../socket/socketTypes.js';
import type { ServerboundGameMessage } from '../../../shared/transport/serverbound.js';

import chat from './chat.js';
import onRematch from './onRematch.js';
import onOfferDraw from './onOfferDraw.js';
import activeGames from './activeGames.js';
import cheatReport from './cheatReport.js';
import onSubscribe from './onSubscribe.js';
import moveSubmission from './moveSubmission.js';
import claimDisconnect from './claimDisconnect.js';
import abortResignGame from './abortResignGame.js';
import onSubscribeRematch from './onSubscribeRematch.js';

/**
 * Handles all incoming websocket messages related to active games.
 * The actions needing no game are routed first; the rest resolve
 * the game the socket belongs to, and its color in it.
 */
function route(ws: CustomWebSocket, contents: ServerboundGameMessage): void {
	// All actions that don't require a game
	switch (contents.action) {
		case 'subscribe':
			onSubscribe.subscribeToGame(ws, contents.value);
			return;
		case 'subscriberematch':
			onSubscribeRematch.subscribeToRematch(ws, contents.value);
			return;
	}

	// Every remaining action targets the game this socket itself subscribed to — never one
	// resolved from the sender's identity, which can name a different game entirely (a socket
	// spectating one game whose owner is playing another).
	const subscription = ws.metadata.subscriptions.game;
	// A detach (tab takeover, rematch-window exit, eviction) can't outrun
	// an action already in flight. A spectator's action lands here too.
	if (subscription === undefined) return;

	const servergame = activeGames.getByID(subscription.id)!; // Guaranteed: Eviction detaches every socket, live subscriptions always names a live game.
	const color = subscription.color;

	// All remaining actions requiring the game they're in
	switch (contents.action) {
		case 'submitmove':
			moveSubmission.submitMove(ws, servergame, contents.value);
			break;
		case 'abort':
			abortResignGame.abort(servergame);
			break;
		case 'resign':
			abortResignGame.resign(servergame, color);
			break;
		case 'engineresign':
			abortResignGame.resignEngine(servergame);
			break;
		case 'claimvictory':
			claimDisconnect.claimVictory(servergame, color);
			break;
		case 'claimdraw':
			claimDisconnect.claimDraw(servergame, color);
			break;
		case 'offerdraw':
			onOfferDraw.offer(servergame, color);
			break;
		case 'acceptdraw':
			onOfferDraw.accept(servergame, color);
			break;
		case 'declinedraw':
			onOfferDraw.decline(servergame, color);
			break;
		case 'offerrematch':
			onRematch.offerRematch(servergame, color);
			break;
		case 'submitchatmessage':
			chat.submitMessage(servergame, color, contents.value);
			break;
		case 'report':
			cheatReport.onReport(servergame, color, contents.value);
			break;
		default:
			console.error('UNKNOWN web socket action received in game route!', contents satisfies never); // prettier-ignore
	}
}

// Exports ---------------------------------------------------------------------

export default { route };
