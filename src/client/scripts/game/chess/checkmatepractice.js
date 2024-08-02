
/**
 * This script handles checkmate practice generation
 */

"use strict";

const checkmatepractice = (function() {

    const validCheckmates = [
        // easy
        "2Q-1k",
        "3R-1k",
        "1K2R-1k",
        "1K2B2B-1k",
        "3B3B-1k",
        "1K1AM-1k",

        // medium
        "1K1Q1B-1k",
        "1K1Q1N-1k",
        "1Q1B1B-1k",
        "1Q2N-1k",
        "2R1N-1k",
        "1K1R1B1B-1k",
        "1K1AR1R-1k",

        // hard
        "1K1N2B1B-1k",
        "1K2N1B1B-1k",
        "1K1R1N1B-1k",
        "1K1R2N-1k",
        "1K1R1GU-1k",
        "1K2AR-1k",

        // insane
        "1K2N7B-1k",
        "1K1Q1P-1k",
        "1K3HA-1k",
    ];

    function generateCheckmateStartingPosition(checkmateID){
        // error if user somehow submitted invalid checkmate ID
        if (!validCheckmates.includes(checkmateID)) return console.error("User tried to play invalid checkmate practice.");

        // the position to be generated
        let startingPosition = {};
        
        // read the elementID and convert it to a position
        const piecelist = checkmateID.match(/[0-9]+[a-zA-Z]+/g);
        for (let entry of piecelist) {
            let amount = entry.match(/[0-9]+/)[0];
            let piece = entry.match(/[a-zA-Z]+/)[0];
            piece = formatconverter.ShortToLong_Piece(piece);
            while (amount != 0) {
                amount -= 1;
                if (math.getPieceColorFromType(piece)) {
                    // place randomly near origin
                    // console.log(Math.random())
                } else {
                    // place randomly at a distance
                }
            }
        }

        return {"0,0": "pawnsW", "1,0": "queensW", "2,0": "queensW", "10,15": "kingsB"};
    }

    return Object.freeze({
        generateCheckmateStartingPosition,
    })
})()