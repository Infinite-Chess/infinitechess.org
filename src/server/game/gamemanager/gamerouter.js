
/*
 * This script routes all incoming websocket messages
 * with the "game" route to where they need to go.
 * 
 * The script that actually keeps track of our active
 * online games is gamemanager
 */

import { getGameBySocket, onRequestRemovalFromPlayersInActiveGames } from './gamemanager.js';
import { offerDraw, acceptDraw, declineDraw } from './onOfferDraw.js';
import { abortGame, resignGame } from './abortresigngame.js';
import { onAFK, onAFK_Return } from './onAFK.js';
import { onReport } from './cheatreport.js';
import { resyncToGame } from './resync.js';
import { submitMove } from './movesubmission.js';
import { onJoinGame } from './joingame.js';



/** @typedef {import('../wsutility.js').CustomWebSocket} CustomWebSocket */
/** @typedef {import('../../socket/receiveSocketMessage.js').WebsocketInMessage} WebsocketInMessage */


/**
 * Handles all incoming websocket messages related to active games.
 * Possible actions: submitmove/offerdraw/abort/resign/joingame/resync...
 * @param {CustomWebSocket} ws - The socket
 * @param {WebsocketInMessage} message - The incoming websocket message, with the properties `route`, `action`, `value`, `id`.
 */
function handleGameRoute(ws, message) {
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
		default:
			return console.error(`Unsupported action ${message.action} in game route.`);
	}
}


export {
	handleGameRoute
};