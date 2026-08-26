// src/server/game/gamemanager/onOfferDraw.ts

/**
 * This script contains the routes for extending, accepting, and rejecting
 * draw offers in online games.
 */

import type { Player } from '../../../shared/util/typeutil.js';
import type { ServerGame } from './servergametypes.js';

import moveutil from '../../../shared/chess/logic/moveutil.js';
import typeutil from '../../../shared/util/typeutil.js';
import gamefileutility from '../../../shared/chess/logic/gamefileutility.js';

import drawoffers from './drawoffers.js';
import gamesockets from './gamesockets.js';
import gameutility from './gameutility.js';
import gamelifecycle from './gamelifecycle.js';
import liveGameValues from './liveGameValues.js';

// Functions -------------------------------------------------------------------

/** Called when client wants to offer a draw. Sends confirmation to opponent. */
function offer(servergame: ServerGame, ourRole: Player): void {
	if (gameutility.isEngineGame(servergame)) return;
	const match = servergame.match;

	if (gamefileutility.isGameOver(servergame))
		return console.error('Client offered a draw when the game is already over. Ignoring.');
	if (drawoffers.isOpen(match))
		return console.error(
			`${ourRole} tried to offer a draw when the game already has a draw offer!`,
		);
	if (drawoffers.offeredTooRecently(servergame, ourRole))
		return console.error('Client tried to offer a draw too fast.');
	if (!moveutil.isGameResignable(servergame))
		return console.error('Client tried to offer a draw on the first 2 moves');

	// Extend the draw offer!

	drawoffers.open(servergame, ourRole);
	liveGameValues.onDrawOfferExtended(servergame, ourRole);

	// Alert their opponent
	const opponentColor = typeutil.invertPlayer(ourRole);
	gamesockets.sendToColor(match, opponentColor, 'game', 'drawoffer', undefined);
}

/** Called when client accepts a draw. Ends the game. */
function accept(servergame: ServerGame, ourRole: Player): void {
	if (gamefileutility.isGameOver(servergame))
		return console.error('Client accepted a draw when the game is already over. Ignoring.');
	if (!drawoffers.isOpen(servergame.match))
		return console.error("Client tried to accept a draw offer when there isn't one.");
	if (drawoffers.isExtendedBy(servergame.match, ourRole))
		return console.error('Client tried to accept their own draw offer, silly!');

	// Accept draw offer!

	drawoffers.close(servergame.match);
	gamelifecycle.conclude(servergame, { victor: null, condition: 'agreement' });
}

/** Called when client declines a draw. Alerts opponent. */
function decline(servergame: ServerGame, ourRole: Player): void {
	const opponentColor = typeutil.invertPlayer(ourRole);

	// Since this method is run every time a move is submitted, we have to early exit
	// if their opponent doesn't have an open draw offer.
	if (!drawoffers.isExtendedBy(servergame.match, opponentColor)) return;

	if (gamefileutility.isGameOver(servergame))
		return console.error('Client declined a draw when the game is already over. Ignoring.');

	// Decline the draw!

	drawoffers.close(servergame.match);

	// Alert their opponent
	gamesockets.sendToColor(servergame.match, opponentColor, 'game', 'declinedraw', undefined); // prettier-ignore
	liveGameValues.onDrawOfferDeclined(servergame);
}

// Exports ---------------------------------------------------------------------

export default {
	offer,
	accept,
	decline,
};
