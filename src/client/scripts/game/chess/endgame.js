
/**
 * This script handles endgame practice generation
 */

"use strict";

const endgame = (function() {

    const validEndgames = [
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

    function getEndgameStartingPosition(endgameID){
        return {"0,0": "pawnsW", "1,0": "queensW", "2,0": "queensW", "10,15": "kingsB"};
    }

    return Object.freeze({
        getEndgameStartingPosition,
    })
})()