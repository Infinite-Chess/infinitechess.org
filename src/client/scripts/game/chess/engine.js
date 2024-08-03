
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
            // This code only works if Black has exactly one king or royal centaur, and only the game is not concluded yet
            // For now, it just submits a random move
            const royalCoords = gamefileutility.getRoyalCoords(gamefile, 'black')[0]
            const endCoords = getRandomRoyalMove(gamefile, royalCoords)
            enginegame.makeEngineMove({startCoords: royalCoords, endCoords: endCoords})
        } catch (e) {
            console.error("You used the engine for an unsupported type of game.")
        }
        
    }

    /**
     * Calculates a random individual legal move by the black king or royal centaur in the given gamefile
     * @param {gamefile} gamefile - The gamefile
     * @param {number[]} blackRoyalCoords - The coordinates of the black royal piece
     * @returns random legalmove
     */
    function getRandomRoyalMove(gamefile, blackRoyalCoords) {
        const blackRoyalPiece = gamefileutility.getPieceAtCoords(gamefile, blackRoyalCoords);
        const blackmoves = legalmoves.calculate(gamefile, blackRoyalPiece)?.individual;
        if (blackmoves) return blackmoves[Math.floor(Math.random() * blackmoves.length)]; // return a random move from the list of moves
        else return undefined;
    }

    return Object.freeze({
        runEngine
    })

})();