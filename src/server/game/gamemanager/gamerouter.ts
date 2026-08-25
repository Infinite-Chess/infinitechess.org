// src/server/game/gamemanager/gamerouter.ts

/*
 * This script routes all incoming websocket messages
 * with the "game" route to where they need to go.
 */

import type { CustomWebSocket } from '../../socket/socketTypes.js';
import type { ServerboundGameMessage } from '../../../shared/transport/serverbound.js';

import onOfferDraw from './onOfferDraw.js';
import gamesockets from './gamesockets.js';
import activegames from './activegames.js';
import { onReport } from './cheatreport.js';
import { submitMove } from './movesubmission.js';
import claimdisconnect from './claimdisconnect.js';
import abortresigngame from './abortresigngame.js';
import { offerRematch } from './onRematch.js';
import { subscribeToGame } from './onSubscribe.js';
import { subscribeToRematch } from './onSubscribeRematch.js';

/**
 * Handles all incoming websocket messages related to active games.
 * The actions needing no game are routed first; the rest resolve
 * the game the socket belongs to, and its color in it.
 */
export function routeGameMessage(ws: CustomWebSocket, contents: ServerboundGameMessage): void {
	// All actions that don't require a game
	switch (contents.action) {
		case 'subscribe':
			subscribeToGame(ws, contents.value);
			return;
		case 'subscriberematch':
			subscribeToRematch(ws, contents.value);
			return;
	}

	const servergame = activegames.getBySocket(ws); // The game they belong in, if they belong in one.
	if (!servergame) {
		// Benign: the game was torn down between the client sending this and the
		// server receiving it (it just concluded). The message is simply stale — drop it.
		// OR, a spectator is sending a message to a game they are spectating, which is not allowed.
		return;
	}

	// The socket's color in this game. Guaranteed defined since getGameBySocket resolved the game
	// for this same socket; treat undefined as a guard against the (impossible) non-participant case.
	const color = gamesockets.getRole(servergame, ws);
	if (color === undefined) return;

	// All remaining actions requiring the game they're in
	switch (contents.action) {
		case 'submitmove':
			submitMove(ws, servergame, contents.value);
			break;
		case 'abort':
			abortresigngame.abort(servergame);
			break;
		case 'resign':
			abortresigngame.resign(servergame, color);
			break;
		case 'engineresign':
			abortresigngame.resignEngine(servergame);
			break;
		case 'claimvictory':
			claimdisconnect.claimVictory(servergame, color);
			break;
		case 'claimdraw':
			claimdisconnect.claimDraw(servergame, color);
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
			offerRematch(servergame, color);
			break;
		case 'report':
			onReport(servergame, color, contents.value);
			break;
		default:
			console.error('UNKNOWN web socket action received in game route!', contents satisfies never); // prettier-ignore
	}
}
