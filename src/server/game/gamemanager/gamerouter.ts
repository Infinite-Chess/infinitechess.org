
/*
 * This script routes all incoming websocket messages
 * with the "game" route to where they need to go.
 * 
 * The script that actually keeps track of our active
 * online games is gamemanager
 */

import { onPaste } from './pastereport.js';
// @ts-ignore
import { getGameBySocket, onRequestRemovalFromPlayersInActiveGames } from './gamemanager.js';
// @ts-ignore
import { offerDraw, acceptDraw, declineDraw } from './onOfferDraw.js';
// @ts-ignore
import { abortGame, resignGame } from './abortresigngame.js';
// @ts-ignore
import { onAFK, onAFK_Return } from './onAFK.js';
// @ts-ignore
import { onReport } from './cheatreport.js';
// @ts-ignore
import { resyncToGame } from './resync.js';
// @ts-ignore
import { submitMove } from './movesubmission.js';
// @ts-ignore
import { onJoinGame } from './joingame.js';

import type { CustomWebSocket } from '../../socket/socketUtility.js';
import type { WebsocketInMessage } from '../../socket/socketRouter.js';


/**
 * Handles all incoming websocket messages related to active games.
 * Possible actions: submitmove/offerdraw/abort/resign/joingame/resync/paste...
 * @param ws - The socket
 * @param message - The incoming websocket message, with the properties `route`, `action`, `value`, `id`.
 */
function handleGameRoute(ws: CustomWebSocket, message: WebsocketInMessage): void {
	const game = getGameBySocket(ws); // The game they belong in, if they belong in one.
	switch (message.action) {
		case 'submitmove':
			submitMove(ws, game, message.value);
			break;
		case 'joingame':
			onJoinGame(ws, game);
			break;
		case 'removefromplayersinactivegames':
			onRequestRemovalFromPlayersInActiveGames(ws, game);
			break;
		case 'resync':
			resyncToGame(ws, game, message.value, message.id);
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
			onReport(ws, game, message.value);
			break;
		case 'paste':
			onPaste(ws, game);
		default:
			return console.error(`Unsupported action ${message.action} in game route.`);
	}
}


export {
	handleGameRoute
};