// src/server/game/gamemanager/onOfferDraw.ts

/**
 * This script contains the routes for extending, accepting, and rejecting
 * draw offers in online games.
 */

import gameutility from './gameutility.js';
import { setGameConclusion } from './gamemanager.js';
import {
	isDrawOfferOpen,
	hasColorOfferedDrawTooFast,
	openDrawOffer,
	doesColorHaveExtendedDrawOffer,
	closeDrawOffer,
} from './drawoffers.js';
import typeutil from '../../../shared/chess/util/typeutil.js';
import { players } from '../../../shared/chess/util/typeutil.js';

import type { CustomWebSocket } from '../../socket/socketUtility.js';
import type { ServerGame } from './gameutility.js';

//--------------------------------------------------------------------------------------------------------

/**
 * Called when client wants to offer a draw. Sends confirmation to opponent.
 * @param ws - The socket
 * @param servergame - The game they are in.
 */
function offerDraw(ws: CustomWebSocket, servergame: ServerGame): void {
	console.log('Client offers a draw.');
	const { match, basegame } = servergame;
	const color = gameutility.doesSocketBelongToGame_ReturnColor(match, ws)!;

	if (gameutility.isGameOver(basegame))
		return console.error('Client offered a draw when the game is already over. Ignoring.');
	if (isDrawOfferOpen(match))
		return console.error(
			`${color} tried to offer a draw when the game already has a draw offer!`,
		);
	if (hasColorOfferedDrawTooFast(servergame, color))
		return console.error('Client tried to offer a draw too fast.');
	if (!gameutility.isGameResignable(basegame))
		return console.error('Client tried to offer a draw on the first 2 moves');

	// Extend the draw offer!

	openDrawOffer(servergame, color);

	// Alert their opponent
	const opponentColor = typeutil.invertPlayer(color);
	gameutility.sendMessageToSocketOfColor(match, opponentColor, 'game', 'drawoffer');
}

/**
 * Called when client accepts a draw. Ends the game.
 * @param ws - The socket
 * @param servergame - The game they are in.
 */
function acceptDraw(ws: CustomWebSocket, servergame: ServerGame): void {
	console.log('Client accepts a draw.');
	const color = gameutility.doesSocketBelongToGame_ReturnColor(servergame.match, ws)!;

	if (gameutility.isGameOver(servergame.basegame))
		return console.error('Client accepted a draw when the game is already over. Ignoring.');
	if (!isDrawOfferOpen(servergame.match))
		return console.error("Client tried to accept a draw offer when there isn't one.");
	if (doesColorHaveExtendedDrawOffer(servergame.match, color))
		return console.error('Client tried to accept their own draw offer, silly!');

	// Accept draw offer!

	closeDrawOffer(servergame.match);
	setGameConclusion(servergame, `${players.NEUTRAL} agreement`); // Player NEUTRAL winning means it was a draw
	gameutility.broadcastGameUpdate(servergame);
}

/**
 * Called when client declines a draw. Alerts opponent.
 * @param ws - The socket
 * @param servergame - The game they are in.
 */
function declineDraw(ws: CustomWebSocket, servergame: ServerGame): void {
	const color = gameutility.doesSocketBelongToGame_ReturnColor(servergame.match, ws)!;
	const opponentColor = typeutil.invertPlayer(color);

	// Since this method is run every time a move is submitted, we have to early exit
	// if their opponent doesn't have an open draw offer.
	if (!doesColorHaveExtendedDrawOffer(servergame.match, opponentColor)) return;

	console.log('Client declines a draw.');

	if (gameutility.isGameOver(servergame.basegame))
		return console.error('Client declined a draw when the game is already over. Ignoring.');

	// Decline the draw!

	closeDrawOffer(servergame.match);

	// Alert their opponent
	gameutility.sendMessageToSocketOfColor(servergame.match, opponentColor, 'game', 'declinedraw');
}

//--------------------------------------------------------------------------------------------------------

export { offerDraw, acceptDraw, declineDraw };
