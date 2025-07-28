
// src/server/game/gamemanager/gamerouter.ts

/*
 * This script routes all incoming websocket messages
 * with the "game" route to where they need to go.
 */

import * as z from 'zod';

import { onPaste } from './pastereport.js';
import { getGameBySocket, onRequestRemovalFromPlayersInActiveGames } from './gamemanager.js';
import { offerDraw, acceptDraw, declineDraw } from './onOfferDraw.js';
import { abortGame, resignGame } from './abortresigngame.js';
import { onAFK, onAFK_Return } from './onAFK.js';
import { onReport, reportschem } from './cheatreport.js';
import { resyncToGame } from './resync.js';
import { submitMove, submitmoveschem } from './movesubmission.js';
import { onJoinGame } from './joingame.js';
import { sendSocketMessage } from '../../socket/sendSocketMessage.js';
import { logEventsAndPrint } from '../../middleware/logEvents.js';
import socketUtility from '../../socket/socketUtility.js';

import type { CustomWebSocket } from '../../socket/socketUtility.js';


const GameSchema = z.discriminatedUnion('action', [
	z.strictObject({ action: z.literal('abort') }),
	z.strictObject({ action: z.literal('resync'), 	 value: z.int() }),
	z.strictObject({ action: z.literal('AFK') }),
	z.strictObject({ action: z.literal('AFK-Return') }),
	z.strictObject({ action: z.literal('offerdraw') }),
	z.strictObject({ action: z.literal('acceptdraw') }),
	z.strictObject({ action: z.literal('declinedraw') }),
	z.strictObject({ action: z.literal('joingame') }),
	z.strictObject({ action: z.literal('resign') }),
	z.strictObject({ action: z.literal('removefromplayersinactivegames') }),
	z.strictObject({ action: z.literal('paste') }),
	z.strictObject({ action: z.literal('report'),	  value: reportschem }),
	z.strictObject({ action: z.literal('submitmove'), value: submitmoveschem })
]);

type GameMessage = z.infer<typeof GameSchema>;


/**
 * Handles all incoming websocket messages related to active games.
 * Possible actions: submitmove/offerdraw/abort/resign/joingame/resync/paste...
 * @param ws - The socket
 * @param contents - The incoming websocket message, with the properties `route`, `action`, `value`, `id`.
 * @param id - The id of the incoming message. This should be included in our response as the `replyto` property.
 */
function routeGameMessage(ws: CustomWebSocket, contents: GameMessage, id: number): void {

	// All actions that don't require a game
	switch (contents.action) {
		case 'resync':
			resyncToGame(ws, contents.value, id);
			return;
		case 'joingame':
			onJoinGame(ws);
			return;
	}

	const game = getGameBySocket(ws); // The game they belong in, if they belong in one.
	if (!game) {
		sendSocketMessage(ws, "general", "notifyerror", "Must be in a game to perform this action. This is a bug, please report it!");
		const errMsg = `In game route, cannot perform action "${contents.action}" when player is not in a game! Websocket metadata: ${socketUtility.stringifySocketMetadata(ws)}`;
		logEventsAndPrint(errMsg, 'errLog.txt');
		return;
	}

	// All remaining actions requiring the game they're in
	switch (contents.action) {
		case 'submitmove':
			submitMove(ws, game, contents.value);
			break;
		case 'removefromplayersinactivegames':
			onRequestRemovalFromPlayersInActiveGames(ws, game);
			break;
		case 'abort':
			abortGame(ws, game);
			break;
		case 'resign':
			resignGame(ws, game);
			break;
		case 'offerdraw':
			offerDraw(ws, game);
			break;
		case 'acceptdraw':
			acceptDraw(ws, game);
			break;
		case 'declinedraw':
			declineDraw(ws, game);
			break;
		case 'AFK':
			onAFK(ws, game);
			break;
		case 'AFK-Return':
			onAFK_Return(ws, game);
			break;
		case 'report':
			onReport(ws, game, contents.value);
			break;
		case 'paste':
			onPaste(ws, game);
			break;
		default:
			// @ts-ignore
			console.error(`UNKNOWN web socket action received in game route! "${contents.action}"`);
	}
}


export {
	routeGameMessage,

	GameSchema,
};