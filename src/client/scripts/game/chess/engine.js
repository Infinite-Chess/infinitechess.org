
/**
 * This script runs the engine
 */

"use strict";

const engine = (function(){

    // main function of this script
    // For now, it only supports checkmate practice mode with a single black royal piece
    function runEngine() {
        const gamefile = game.getGamefile();
        const royalCoords = gamefileutility.getRoyalCoords(gamefile, 'black')[0]
        const endCoords = getRandomRoyalMove(gamefile, royalCoords)
        enginegame.makeEngineMove({startCoords: royalCoords, endCoords: endCoords})
    }

    /**
     * Calculates a random individual legal move by the black royal piece in the given position
     * @param {gamefile} gamefile - The gamefile
     * @param {number[]} blackRoyalCoords - The coordinates of the black royal piece
     * @returns random legalmove
     */
    function getRandomRoyalMove(gamefile, blackRoyalCoords) {
        const blackRoyalPiece = gamefileutility.getPieceAtCoords(gamefile, blackRoyalCoords);
        const blackmoves = legalmoves.calculate(gamefile, blackRoyalPiece).individual;
        return blackmoves[Math.floor(Math.random() * blackmoves.length)]
    }

    return Object.freeze({
        runEngine
    })

})();