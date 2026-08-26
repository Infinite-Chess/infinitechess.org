// src/server/game/gamemanager/gameRouter.ts

/**
 * Routes every incoming websocket message on the "game" route to its handler.
 *
 * See docs/systems/WEBSOCKETS.md.
 */

import type { CustomWebSocket } from '../../socket/socketTypes.js';
import type { ServerboundGameMessage } from '../../../shared/transport/serverbound.js';

import onRematch from './onRematch.js';
import onOfferDraw from './onOfferDraw.js';
import gameSockets from './gameSockets.js';
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
function routeGameMessage(ws: CustomWebSocket, contents: ServerboundGameMessage): void {
	// All actions that don't require a game
	switch (contents.action) {
		case 'subscribe':
			onSubscribe.subscribeToGame(ws, contents.value);
			return;
		case 'subscriberematch':
			onSubscribeRematch.subscribeToRematch(ws, contents.value);
			return;
	}

	const servergame = activeGames.getBySocket(ws); // The game they belong in, if they belong in one.
	if (!servergame) {
		// Benign: the game was torn down between the client sending this and the
		// server receiving it (it just concluded). The message is simply stale — drop it.
		// OR, a spectator is sending a message to a game they are spectating, which is not allowed.
		return;
	}

	// The socket's color in this game. Guaranteed defined since getGameBySocket resolved the game
	// for this same socket; treat undefined as a guard against the (impossible) non-participant case.
	const color = gameSockets.getRole(servergame, ws);
	if (color === undefined) return;

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
		case 'report':
			cheatReport.onReport(servergame, color, contents.value);
			break;
		default:
			console.error('UNKNOWN web socket action received in game route!', contents satisfies never); // prettier-ignore
	}
}

// Exports ---------------------------------------------------------------------

export default { routeGameMessage };
