/**
 * This script runs the chess engine for enginegames.
 * It is modular and may be replaced by any other engine script to test a different engine.
 * To that end, engine.runEngine(gamefile) is the only function that is called from the outside.
 */

"use strict";

const engine = (function(){

    /**
     * Main function of this script. It gets called as soon as the human player submits a move.
     * It takes a gamefile as an input and computes a move.
     * @param {gamefile} gamefile - gamefile of the current game
     * @returns {Promise} - promise which resolves to some engine move
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
        const blackRoyalPiece = gamefileutility.getPieceAtCoords(gamefile, royalCoords);
        const blackmoves = legalmoves.calculate(gamefile, blackRoyalPiece).individual;
        const randomEndCoords = blackmoves[Math.floor(Math.random() * blackmoves.length)]; // random endcoords from the list of individual moves
        const move = {startCoords: royalCoords, endCoords: randomEndCoords};
        specialdetect.transferSpecialFlags_FromCoordsToMove(royalCoords, move);
        return move;
    }

    return Object.freeze({
        runEngine
    })

})();