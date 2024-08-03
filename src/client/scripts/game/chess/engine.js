
/**
 * This script runs the chess engine for enginegames
 */

"use strict";

const engine = (function(){

    /**
     * Main function of this script.
     * It gets called as soon as the human player submits a move.
     * It ends by submitting a move via enginegame.makeEngineMove(move).
     */
    function runEngine() {
        const gamefile = game.getGamefile();

        try {
            // This code only works if Black has exactly one king or royal centaur
            // For now, it just submits a random move for Black
            const randomMove = getRandomRoyalMove(gamefile, "black")
            enginegame.makeEngineMove(randomMove)
        } catch (e) {
            console.error("You used the engine for an unsupported type of game.")
        }
        
    }

    /**
     * Calculates a random legal move for a player
     * Only works if that player has a lone king or royal centaur
     * @param {gamefile} gamefile - The gamefile
     * @param {string} color - "white" or "black": The color of the player to move
     * @returns random legalmove
     */
    function getRandomRoyalMove(gamefile, color) {
        const royalCoords = gamefileutility.getRoyalCoords(gamefile, color)[0]
        const blackRoyalPiece = gamefileutility.getPieceAtCoords(gamefile, royalCoords);
        const blackmoves = legalmoves.calculate(gamefile, blackRoyalPiece).individual;
        const randomEndCoords = blackmoves[Math.floor(Math.random() * blackmoves.length)]; // random endcoords from the list of individual moves
        const move = {startCoords: royalCoords, endCoords: randomEndCoords};
        return move;
    }

    return Object.freeze({
        runEngine
    })

})();