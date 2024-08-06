

"use strict";


const engineAndreas = (function(){
    // Black royal piece properties
    const king_moves = [ 
        [-1,  1], [0,  1], [1,  1],
        [-1,  0],        , [1,  0],
        [-1, -1], [0, -1], [1, -1],
    ];
    const centaur_moves = [ 
                  [-1,  2],          [1,  2],
        [-2,  1], [-1,  1], [0,  1], [1,  1], [2,  1],
                  [-1,  0],        , [1,  0],
        [-2, -1], [-1, -1], [0, -1], [1, -1], [2, -1],
                  [-1, -2],          [1, -2]
    ];
    let royal_coords;
    let royal_moves;

    // White pieces. Their coordinates are relative to the black royal

    let piecelist;

    const pieceTypeDictionary = {
        "queensW": {slides: [[1, 0], [0, 1], [1, 1], [1, -1]]},
        "rooksW": {slides: [[1, 0], [0, 1]]},
        "bishopsW": {slides: [[1, 1], [1, -1]]},
        "knightsW": {jumps: [[1, 2], [-1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, 1], [-2, -1]]},
        "kingsW": {jumps: [[-1, 1], [0, 1], [1, 1], [-1, 0], [1, 0], [-1, -1], [0, -1], [1, -1]], is_royal: true},
        "pawnsW": {jumps: [0, 1], is_pawn: true}
    };

    class Piece {
        constructor({coords, slides, jumps, slideLimit = 10, is_royal = false, is_pawn = false} = {}){
            this.coords = coords;
            this.slides = slides;
            this.jumps = jumps;
            this.slideLimit = slideLimit;
            this.is_royal = is_royal;
            this.is_pawn = is_pawn;
        }
    }

    function rider_threatens(piece, square) {
        
    }

    async function runEngine(gamefile) {
        // parse gamefile into engine readable format
        if ("kingsB" in gamefile.ourPieces){
            royal_coords = gamefile.ourPieces["kingsB"][0];
            royal_moves = king_moves;
        } else if ("royalCentaursB" in gamefile.ourPieces) {
            royal_coords = gamefile.ourPieces["royalCentaursB"][0];
            royal_moves = centaur_moves;
        } else {
            return console.error("No black king or royal centaur found in game");
        }

        piecelist = [];
        for (let key in gamefile.piecesOrganizedByKey) {
            const pieceType = gamefile.piecesOrganizedByKey[key];
            if (math.getWorBFromType(pieceType) != "W") continue;
            let piece = new Piece({
                coords: math.getCoordsFromKey(key),
                ...pieceTypeDictionary[pieceType]
            });
            piecelist.push(piece);
        }

        return engineRandomRoyalMoves.runEngine(gamefile);
    }    

    return Object.freeze({
        runEngine
    })

})();