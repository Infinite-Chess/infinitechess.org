
/**
 * This script handles endgame practice generation
 */

"use strict";

const endgame = (function() {

    const validEndgames = ["endgame1"];

    function getEndgameStartingPosition(endgameID){
        return {"0,0": "kingsW", "1,0": "queensW", "2,0": "queensW", "10,15": "kingsB"};
    }

    return Object.freeze({
        getEndgameStartingPosition,
    })
})()