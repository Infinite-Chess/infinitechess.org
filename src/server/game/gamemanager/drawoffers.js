
/**
 * This script contains utility methods for draw offers,
 * and has almost zero dependancies.
 * 
 * It does NOT contain the routes for when a player
 * extends/accepts a draw offer!
 * NOR does it send any websocket messages.
 */

import { logEventsAndPrint } from '../../middleware/logEvents.js';

/** @typedef {import('./gameutility.js').Game} Game */

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
 * @param {Game} game
 * @returns {boolean}
 */
function isDrawOfferOpen(game) {
	return game.drawOfferState !== undefined;
}

/**
 * Returns true if the given color has extended a draw offer that's not confirmed yet.
 * @param {Game} game
 * @param {Player} color - The color who extended the draw offer
 * @returns {boolean}
 */
function doesColorHaveExtendedDrawOffer(game, color) {
	return game.drawOfferState === color;
}

/**
 * Returns true if they given color has extended a draw offer
 * too recently for them to extend another, yet.
 * @param {Game} game 
 * @param {Player} color 
 * @returns {boolean}
 */
function hasColorOfferedDrawTooFast(game, color) {
	const lastPlyDrawOffered = getLastDrawOfferPlyOfColor(game, color); // number | undefined
	if (lastPlyDrawOffered !== undefined) { // They have made atleast 1 offer this game
		// console.log("Last ply offered:", lastPlyDrawOffered);
		const movesSinceLastOffer = game.moves.length - lastPlyDrawOffered;
		if (movesSinceLastOffer < movesBetweenDrawOffers) return true;
	}
	return false;
}

/**
 * Opens a draw offer, extended by the provided color.
 * DOES NOT INFORM the opponent.
 * @param {Game} game
 * @param {Player} color - The color of the player extending the offer
 */
function openDrawOffer(game, color) {
	if (isDrawOfferOpen(game)) return logEventsAndPrint("MUST NOT open a draw offer when there's already one open!!", "errorLog.txt");
	const data = game.players[color];
	data.lastOfferPly = game.moves.length;
	game.drawOfferState = color;
}

/**
 * Closes any open draw offer.
 * DOES NOT INFORM the opponent.
 * @param {Game} game
 */
function closeDrawOffer(game) {
	game.drawOfferState = undefined;
}

/**
 * Returns the last ply move the provided color has offered a draw,
 * if they have, otherwise undefined.
 * @param {Game} game
 * @param {Player} color
 * @returns {number | undefined}
 */
function getLastDrawOfferPlyOfColor(game, color) {
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