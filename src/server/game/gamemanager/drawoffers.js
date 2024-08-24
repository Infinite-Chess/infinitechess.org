
/**
 * This script contains utility methods for draw offers,
 * and has almost zero dependancies.
 * 
 * It does NOT contain the routes for when a player
 * extends/accepts a draw offer!
 * NOR does it send any websocket messages.
 */

// eslint-disable-next-line no-unused-vars
import { Game } from '../TypeDefinitions.js';
import { logEvents } from '../../middleware/logEvents.js';

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
    return game.drawOffers.state !== undefined;
}

/**
 * Returns true if the given color has extended a draw offer that's not confirmed yet.
 * @param {Game} game
 * @param {string} color - The color who extended the draw offer
 * @returns {boolean}
 */
function doesColorHaveExtendedDrawOffer(game, color) {
    return game.drawOffers.state === color;
}

/**
 * Returns true if they given color has extended a draw offer
 * too recently for them to extend another, yet.
 * @param {Game} game 
 * @param {string} color 
 * @returns {boolean}
 */
function hasColorOfferedDrawTooFast(game, color) {
    const lastPlyDrawOffered = game.drawOffers.lastOfferPly[color]; // number | undefined
    if (lastPlyDrawOffered !== undefined) { // They have made atleast 1 offer this game
        const movesSinceLastOffer = game.moves.length - lastPlyDrawOffered;
        if (movesSinceLastOffer < movesBetweenDrawOffers) return true;
    }
    return false;
}

/**
 * Opens a draw offer, extended by the provided color.
 * DOES NOT INFORM the opponent.
 * @param {Game} game
 * @param {string} color - The color of the player extending the offer
 */
function openDrawOffer(game, color) {
    if (isDrawOfferOpen(game)) return logEvents("MUST NOT open a draw offer when there's already one open!!", "errorLog.txt", { print: true });
    game.drawOffers.lastOfferPly[color] = game.moves.length;
    game.drawOffers.state = color;
}

/**
 * Closes any open draw offer.
 * DOES NOT INFORM the opponent.
 * @param {Game} game
 */
function closeDrawOffer(game) {
    game.drawOffers.state = undefined;
}

/**
 * Returns the last ply move the provided color has offered a draw,
 * if they have, otherwise undefined.
 * @param {Game} game
 * @param {string} color
 * @returns {number | undefined}
 */
function getLastDrawOfferPlyOfColor(game, color) {
    return game.drawOffers.lastOfferPly[color];
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