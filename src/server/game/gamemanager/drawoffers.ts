
/**
 * This script contains utility methods for draw offers,
 * and has almost zero dependancies.
 * 
 * It does NOT contain the routes for when a player
 * extends/accepts a draw offer!
 * NOR does it send any websocket messages.
 */

import { logEventsAndPrint } from '../../middleware/logEvents.js';

import type { Game } from './gameutility.js';
import type { Player } from '../../../shared/chess/util/typeutil.js';

//--------------------------------------------------------------------------------------------------------

/**
 * Minimum number of plies (half-moves) that
 * must span between 2 consecutive draw offers
 * by the same player!
 * 
 * THIS MUST ALWAYS MATCH THE CLIENT-SIDE!!!!
 */
const movesBetweenDrawOffers = 2;

//--------------------------------------------------------------------------------------------------------

/**
 * Returns true if the game currently has an open draw offer.
 * If so, players are not allowed to extend another.
 */
function isDrawOfferOpen(game: Game): boolean {
	return game.drawOfferState !== undefined;
}

/**
 * Returns true if the given color has extended a draw offer that's not confirmed yet.
 * @param color - The color who extended the draw offer
 */
function doesColorHaveExtendedDrawOffer(game: Game, color: Player): boolean {
	return game.drawOfferState === color;
}

/**
 * Returns true if they given color has extended a draw offer
 * too recently for them to extend another, yet.
 */
function hasColorOfferedDrawTooFast(game: Game, color: Player): boolean {
	const lastPlyDrawOffered = getLastDrawOfferPlyOfColor(game, color); // number | undefined
	if (lastPlyDrawOffered !== undefined) { // They have made at least 1 offer this game
		// console.log("Last ply offered:", lastPlyDrawOffered);
		const movesSinceLastOffer = game.moves.length - lastPlyDrawOffered;
		if (movesSinceLastOffer < movesBetweenDrawOffers) return true;
	}
	return false;
}

/**
 * Opens a draw offer, extended by the provided color.
 * DOES NOT INFORM the opponent.
 * @param color - The color of the player extending the offer
 */
function openDrawOffer(game: Game, color: Player): void {
	if (isDrawOfferOpen(game)) {
		logEventsAndPrint("MUST NOT open a draw offer when there's already one open!!", "errLog.txt");
		return;
	}
	const playerdata = game.players[color]!;
	playerdata.lastOfferPly = game.moves.length;
	game.drawOfferState = color;
	return;
}

/**
 * Closes any open draw offer.
 * DOES NOT INFORM the opponent.
 */
function closeDrawOffer(game: Game): void {
	game.drawOfferState = undefined;
}

/**
 * Returns the last ply move the provided color has offered a draw,
 * if they have, otherwise undefined.
 */
function getLastDrawOfferPlyOfColor(game: Game, color: Player): number | undefined {
	return game.players[color]?.lastOfferPly;
}

//--------------------------------------------------------------------------------------------------------

export {
	movesBetweenDrawOffers,
	isDrawOfferOpen,
	doesColorHaveExtendedDrawOffer,
	hasColorOfferedDrawTooFast,
	openDrawOffer,
	closeDrawOffer,
	getLastDrawOfferPlyOfColor,
};