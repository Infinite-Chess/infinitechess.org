// src/server/game/gamemanager/onOfferDraw.ts

/**
 * This script contains the routes for extending, accepting, and rejecting
 * draw offers in online games.
 */

import type { Player } from '../../../shared/chess/util/typeutil.js';
import type { ServerGame } from './gameutility.js';

import typeutil from '../../../shared/chess/util/typeutil.js';

import gameutility from './gameutility.js';
import liveGameValues from './liveGameValues.js';
import { onGameConclusion } from './gamemanager.js';
import {
	isDrawOfferOpen,
	hasColorOfferedDrawTooFast,
	openDrawOffer,
	doesColorHaveExtendedDrawOffer,
	closeDrawOffer,
} from './drawoffers.js';

//--------------------------------------------------------------------------------------------------------

/**
 * Called when client wants to offer a draw. Sends confirmation to opponent.
 * @param servergame - The game they are in.
 * @param ourRole - The color the socket is playing as.
 */
function offerDraw(servergame: ServerGame, ourRole: Player): void {
	// console.log('Client offers a draw.');
	const match = servergame.match;

	if (gameutility.isGameOver(servergame))
		return console.error('Client offered a draw when the game is already over. Ignoring.');
	if (isDrawOfferOpen(match))
		return console.error(
			`${ourRole} tried to offer a draw when the game already has a draw offer!`,
		);
	if (hasColorOfferedDrawTooFast(servergame, ourRole))
		return console.error('Client tried to offer a draw too fast.');
	if (!gameutility.isGameResignable(servergame))
		return console.error('Client tried to offer a draw on the first 2 moves');

	// Extend the draw offer!

	openDrawOffer(servergame, ourRole);
	liveGameValues.onDrawOfferExtended(servergame, ourRole);

	// Alert their opponent
	const opponentColor = typeutil.invertPlayer(ourRole);
	gameutility.sendMessageToColor(match, opponentColor, 'game', 'drawoffer');
}

/**
 * Called when client accepts a draw. Ends the game.
 * @param servergame - The game they are in.
 * @param ourRole - The color the socket is playing as.
 */
function acceptDraw(servergame: ServerGame, ourRole: Player): void {
	// console.log('Client accepts a draw.');

	if (gameutility.isGameOver(servergame))
		return console.error('Client accepted a draw when the game is already over. Ignoring.');
	if (!isDrawOfferOpen(servergame.match))
		return console.error("Client tried to accept a draw offer when there isn't one.");
	if (doesColorHaveExtendedDrawOffer(servergame.match, ourRole))
		return console.error('Client tried to accept their own draw offer, silly!');

	// Accept draw offer!

	closeDrawOffer(servergame.match);
	onGameConclusion(servergame, { victor: null, condition: 'agreement' });
}

/**
 * Called when client declines a draw. Alerts opponent.
 * @param servergame - The game they are in.
 * @param ourRole - The color the socket is playing as.
 */
function declineDraw(servergame: ServerGame, ourRole: Player): void {
	const opponentColor = typeutil.invertPlayer(ourRole);

	// Since this method is run every time a move is submitted, we have to early exit
	// if their opponent doesn't have an open draw offer.
	if (!doesColorHaveExtendedDrawOffer(servergame.match, opponentColor)) return;

	// console.log('Client declines a draw.');

	if (gameutility.isGameOver(servergame))
		return console.error('Client declined a draw when the game is already over. Ignoring.');

	// Decline the draw!

	closeDrawOffer(servergame.match);

	// Alert their opponent
	gameutility.sendMessageToColor(servergame.match, opponentColor, 'game', 'declinedraw');
	liveGameValues.onDrawOfferDeclined(servergame);
}

//--------------------------------------------------------------------------------------------------------

export { offerDraw, acceptDraw, declineDraw };
