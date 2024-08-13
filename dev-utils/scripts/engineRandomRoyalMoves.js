// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
// DEPRECATED ENGINE FORMAT!!! PLEASE REFER TO engineCheckmatePractice.js
// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

/**
 * This script runs a very basic chess engine for enginegames that just computes a random move for the black royal piece.
 * runEngine(gamefile) is the only function that is called from the outside.
 * You may specify a different engine to be used by specifying a different engine name in the gameOptions when initializing an engine game.
 * 
 * @author Andreas Tsevas
 */

"use strict";

const engineRandomRoyalMoves = (function(){

    /**
     * Main function of this script. It gets called as soon as the human player submits a move.
     * It takes a gamefile as an input and computes a move.
     * @param {gamefile} gamefile - gamefile of the current game
     * @returns {Promise<Move>} - promise which resolves to some engine move
     */
    async function runEngine(gamefile) {
        try {
            // This code only works if Black has exactly one king or royal centaur
            // For now, it just submits a random move for Black
            const randomMove = getRandomRoyalMove(gamefile, "black")
            await main.sleep(500) // unnecessary delay
            return Promise.resolve(randomMove);
        } catch (e) {
            console.error("You used the engine for an unsupported type of game.")
        }
    }

    /**
     * Calculates a random legal move for a player
     * Only works if that player has a lone king or royal centaur
     * @param {gamefile} gamefile - The gamefile
     * @param {string} color - "white" or "black": The color of the player to move
     * @returns {Move} random legalmove
     */
    function getRandomRoyalMove(gamefile, color) {
        const royalCoords = gamefileutility.getRoyalCoords(gamefile, color)[0]
        const royalPiece = gamefileutility.getPieceAtCoords(gamefile, royalCoords);
        const moves = legalmoves.calculate(gamefile, royalPiece).individual;
        const randomEndCoords = moves[Math.floor(Math.random() * moves.length)]; // random endcoords from the list of individual moves
        const move = {startCoords: royalCoords, endCoords: randomEndCoords};
        specialdetect.transferSpecialFlags_FromCoordsToMove(randomEndCoords, move);
        return move;
    }

    return Object.freeze({
        runEngine
    })

})();