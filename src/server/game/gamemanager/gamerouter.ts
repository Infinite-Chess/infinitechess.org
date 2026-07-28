// src/server/game/gamemanager/gamerouter.ts

/*
 * This script routes all incoming websocket messages
 * with the "game" route to where they need to go.
 */

import type { CustomWebSocket } from '../../socket/socketUtility.js';

import * as z from 'zod';

import gameutility from './gameutility.js';
import { offerRematch } from './onRematch.js';
import { getGameBySocket } from './gamemanager.js';
import { onSubscribeToGame } from './onSubscribe.js';
import { onSubscribeToRematch } from './onSubscribeRematch.js';
import { abortGame, resignGame } from './abortresigngame.js';
import { onReport, reportschem } from './cheatreport.js';
import { claimVictory, claimDraw } from './claimdisconnect.js';
import { submitMove, submitmoveschem } from './movesubmission.js';
import { offerDraw, acceptDraw, declineDraw } from './onOfferDraw.js';

const GameSchema = z.discriminatedUnion('action', [
	z.strictObject({ action: z.literal('abort') }),
	z.strictObject({ action: z.literal('subscriberematch'), value: z.int() }),
	z.strictObject({ action: z.literal('offerdraw') }),
	z.strictObject({ action: z.literal('acceptdraw') }),
	z.strictObject({ action: z.literal('declinedraw') }),
	z.strictObject({ action: z.literal('offerrematch') }),
	z.strictObject({ action: z.literal('subscribe'), value: z.number().int().nonnegative() }),
	z.strictObject({ action: z.literal('resign') }),
	z.strictObject({ action: z.literal('engineresign') }),
	z.strictObject({ action: z.literal('claimvictory') }),
	z.strictObject({ action: z.literal('claimdraw') }),
	z.strictObject({ action: z.literal('report'), value: reportschem }),
	z.strictObject({ action: z.literal('submitmove'), value: submitmoveschem }),
]);

type GameMessage = z.infer<typeof GameSchema>;

/**
 * Handles all incoming websocket messages related to active games.
 * Possible actions: submitmove/offerdraw/abort/resign/subscribe/subscriberematch/paste...
 * @param ws - The socket
 * @param contents - The incoming websocket message, with the properties `route`, `action`, `value`, `id`.
 * @param id - The id of the incoming message. This should be included in our response as the `replyto` property.
 */
function routeGameMessage(ws: CustomWebSocket, contents: GameMessage): void {
	// All actions that don't require a game
	switch (contents.action) {
		case 'subscribe':
			onSubscribeToGame(ws, contents.value);
			return;
		case 'subscriberematch':
			onSubscribeToRematch(ws, contents.value);
			return;
	}

	const servergame = getGameBySocket(ws); // The game they belong in, if they belong in one.
	if (!servergame) {
		// Benign: the game was torn down between the client sending this and the
		// server receiving it (it just concluded). The message is simply stale — drop it.
		// OR, a spectator is sending a message to a game they are spectating, which is not allowed.
		return;
	}

	// The socket's color in this game. Guaranteed defined since getGameBySocket resolved the game
	// for this same socket; treat undefined as a guard against the (impossible) non-participant case.
	const color = gameutility.getSocketRoleInGame(servergame, ws);
	if (color === undefined) return;

	// All remaining actions requiring the game they're in
	switch (contents.action) {
		case 'submitmove':
			submitMove(ws, servergame, contents.value);
			break;
		case 'abort':
			abortGame(servergame);
			break;
		case 'resign':
			resignGame(servergame, color);
			break;
		case 'engineresign':
			if (!gameutility.isEngineGame(servergame)) break;
			if (gameutility.isGameResignable(servergame))
				resignGame(servergame, servergame.match.engineParticipant!.color);
			else abortGame(servergame);
			break;
		case 'claimvictory':
			claimVictory(servergame, color);
			break;
		case 'claimdraw':
			claimDraw(servergame, color);
			break;
		case 'offerdraw':
			offerDraw(servergame, color);
			break;
		case 'acceptdraw':
			acceptDraw(servergame, color);
			break;
		case 'declinedraw':
			declineDraw(servergame, color);
			break;
		case 'offerrematch':
			offerRematch(servergame, color);
			break;
		case 'report':
			onReport(servergame, color, contents.value);
			break;
		default:
			// @ts-ignore
			console.error(`UNKNOWN web socket action received in game route! "${contents.action}"`);
	}
}

export { routeGameMessage, GameSchema };
