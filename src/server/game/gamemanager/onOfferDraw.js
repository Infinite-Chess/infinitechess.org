
/**
 * This script contains the routes for extending, accepting, and rejecting
 * draw offers in online games.
 */

import gameutility from './gameutility.js';
import math1 from '../math1.js';
import movesscript1 from '../movesscript1.js';
import { setGameConclusion } from './gamemanager.js';
import { isDrawOfferOpen, hasColorOfferedDrawTooFast, openDrawOffer, doesColorHaveExtendedDrawOffer, closeDrawOffer } from './drawoffers.js';

/**
 * Type Definitions
 * @typedef {import('../TypeDefinitions.js').Socket} Socket
 * @typedef {import('../TypeDefinitions.js').Game} Game
 */

//--------------------------------------------------------------------------------------------------------

/** 
 * Called when client wants to offer a draw. Sends confirmation to opponent.
 * @param {Socket} ws - The socket
 * @param {Game | undefined} game - The game they belong in, if they belong in one.
 */
function offerDraw(ws, game) {
    console.log("Client offers a draw.");

    if (!game) return console.error("Client offered a draw when they don't belong in a game.");
    const color = gameutility.doesSocketBelongToGame_ReturnColor(game, ws);

    if (gameutility.isGameOver(game)) return console.error("Client offered a draw when the game is already over. Ignoring.");
    if (isDrawOfferOpen(game)) return console.error(`${color.toUpperCase()} tried to offer a draw when the game already has a draw offer!`);
    if (hasColorOfferedDrawTooFast(game, color)) return console.error("Client tried to offer a draw too fast.");
    if (!movesscript1.isGameResignable(game)) return console.error("Client tried to offer a draw on the first 2 moves");

    // Extend the draw offer!

    openDrawOffer(game, color);

    // Alert their opponent
    const opponentColor = math1.getOppositeColor(color);
    gameutility.sendMessageToSocketOfColor(game, opponentColor, 'game', 'drawoffer');
}

/** 
 * Called when client accepts a draw. Ends the game.
 * @param {Socket} ws - The socket
 * @param {Game | undefined} game - The game they belong in, if they belong in one.
 * @returns {true | undefined} true if the draw accept was a success (the game manager should terminate the game), otherwise undefined.
 */
function acceptDraw(ws, game) {
    console.log("Client accepts a draw.");

    if (!game) return console.error("Client accepted a draw when they don't belong in a game.");
    const color = gameutility.doesSocketBelongToGame_ReturnColor(game, ws);

    if (gameutility.isGameOver(game)) return console.error("Client accepted a draw when the game is already over. Ignoring.");
    if (!isDrawOfferOpen(game)) return console.error("Client tried to accept a draw offer when there isn't one.");
    if (doesColorHaveExtendedDrawOffer(game, color)) return console.error("Client tried to accept their own draw offer, silly!");

    // Accept draw offer!
    
    closeDrawOffer(game);
    console.log(typeof setGameConclusion);
    setGameConclusion(game, "draw agreement");
    gameutility.sendGameUpdateToBothPlayers(game);
}

/** 
 * Called when client declines a draw. Alerts opponent.
 * @param {Socket} ws - The socket
 * @param {Game | undefined} game - The game they belong in, if they belong in one.
 */
function declineDraw(ws, game) {
    if (!game) return console.error("Can't decline any open draw when they don't belong in a game.");
    const color = gameutility.doesSocketBelongToGame_ReturnColor(game, ws);
    const opponentColor = math1.getOppositeColor(color);

    // Since this method is run every time a move is submitted, we have to early exit
    // if their opponent doesn't have an open draw offer. 
    if (!doesColorHaveExtendedDrawOffer(game, opponentColor)) return;

    console.log("Client declines a draw.");

    if (gameutility.isGameOver(game)) return console.error("Client declined a draw when the game is already over. Ignoring.");

    // Decline the draw!

    closeDrawOffer(game);

    // Alert their opponent
    gameutility.sendMessageToSocketOfColor(game, opponentColor, 'game', 'declinedraw');
}

//--------------------------------------------------------------------------------------------------------

export {
    offerDraw,
    acceptDraw,
    declineDraw,
};