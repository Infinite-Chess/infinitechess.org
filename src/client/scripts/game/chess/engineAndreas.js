

"use strict";


const engineAndreas = (function(){
    // Black royal piece properties. The black royal piece is always at square [0,0]
    const king_moves = [ 
        [-1,  1], [0,  1], [1,  1],
        [-1,  0],          [1,  0],
        [-1, -1], [0, -1], [1, -1],
    ];
    const centaur_moves = [ 
                  [-1,  2],          [1,  2],
        [-2,  1], [-1,  1], [0,  1], [1,  1], [2,  1],
                  [-1,  0],          [1,  0],
        [-2, -1], [-1, -1], [0, -1], [1, -1], [2, -1],
                  [-1, -2],          [1, -2]
    ];
    let royal_moves;

    // White pieces. Their coordinates are relative to the black royal
    let start_piecelist;
    let start_coordlist;

    const pieceNameDictionary = {
        // 0 corresponds to a captured piece
       "queensW": 1,
       "rooksW": 2,
       "bishopsW": 3,
       "knightsW": 4,
       "kingsW": 5,
       "pawnsW": 6 ,
       "amazonsW": 7,
       "hawksW": 8,
       "chancellorsW": 9,
       "archbishopsW": 10,
       "knightridersW": 11
    }

    const pieceTypeDictionary = {
        // 0 corresponds to a captured piece
        1: {rides: [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]}, // queen
        2: {rides: [[1, 0], [0, 1], [-1, 0], [0, -1]]}, // rook
        3: {rides: [[1, 1], [-1, -1], [1, -1], [-1, 1]]}, // bishop
        4: {jumps: [[1, 2], [-1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, 1], [-2, -1]]}, // knight
        5: {jumps: [[-1, 1], [0, 1], [1, 1], [-1, 0], [1, 0], [-1, -1], [0, -1], [1, -1]], is_royal: true}, // king
        6: {jumps: [0, 1], is_pawn: true}, //pawn
        7: {rides: [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]],
            jumps: [[1, 2], [-1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, 1], [-2, -1]]}, // amazon
        8: {jumps: [[2, 0], [3, 0], [2, 2], [3, 3], [0, 2], [0, 3], [-2, 2], [-3, 3], [-2, 0], [-3, 0],
                    [-2, -2], [-3, -3], [0, -2], [0, -3], [2, -2], [3, -3]]}, //hawk
        9: {rides: [[1, 0], [0, 1], [-1, 0], [0, -1]],
            jumps: [[1, 2], [-1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, 1], [-2, -1]]}, // chancellor
        10: {rides: [[1, 1], [-1, -1], [1, -1], [-1, 1]],
            jumps: [[1, 2], [-1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, 1], [-2, -1]]}, // archbishop
        11: {rides: [[1, 2], [-1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, 1], [-2, -1]]} // knightrider
    };

    /**
     * 
     * @param {number[]} v - vector like [10,20]
     * @param {number[]} direction - vector like [1,2]
     * @returns {Array} like [boolean, scalar multiple]
     */
    function is_natural_multiple(v, direction) {
        let scalar;
        if (direction[0] != 0) scalar = v[0] / direction[0];
        else scalar = v[1] / direction[1];

        return [scalar > 0 && scalar * direction[0] == v[0] && scalar * direction[1] == v[1], scalar];
    }

    function rider_threatens(direction, piece_square, target_square, piecelist, coordlist) {
        const [works, distance] = is_natural_multiple([target_square[0] - piece_square[0], target_square[1] - piece_square[1]], direction);
        if (works) {
            // loop over all potential blockers
            for (let i = 0; i < coordlist.length; i++) {
                if (piecelist[i] != 0) {
                    const [collinear, thispiecedistance] = is_natural_multiple([coordlist[i][0] - piece_square[0], coordlist[i][1] - piece_square[1]], direction);
                    if (collinear && thispiecedistance < distance) {
                        return false;
                    }
                }
            }
            return true;
        }
        return false;
    }

    function move(square, v) {
        return [square[0] + v[0], square[1] + v[1]];
    }

    function squares_are_equal(square_1, square_2) {
        return square_1[0] == square_2[0] && square_1[1] == square_2[1];
    }

    function tuplelist_contains_tuple(tuplelist, tuple) {
        for (let entry of tuplelist) {
            if (tuple[0] == entry[0] && tuple[1] == entry[1]) return true;
        }
        return false;
    }

    function piece_threatens_square(piece_index, target_square, piecelist, coordlist) {
        const piece_type = piecelist[piece_index];

        // piece no longer exists
        if (piece_type == 0) return false;

        const piece_properties = pieceTypeDictionary[piece_type];
        const piece_square = coordlist[piece_index];

        // piece is already on square
        if (squares_are_equal(piece_square, target_square)) return false;

        // pawn threatening
        if (piece_properties.is_pawn) {
            if (squares_are_equal(move(piece_square, [-1, 1]), target_square) || squares_are_equal(move(piece_square, [1, 1]), target_square)) return true;
            else return false;
        }

        // jump move threatening
        if (piece_properties.jumps) {
            if (tuplelist_contains_tuple(piece_properties.jumps, [target_square[0] - piece_square[0], target_square[1] - piece_square[1]])) return true;
        }

        // rider move threatening
        if (piece_properties.rides) {
            for (let ride_directrion of piece_properties.rides) {
                if (rider_threatens(ride_directrion, piece_square, target_square, piecelist, coordlist)) return true;
            }
        }

        return false;
    }

    function square_is_threatened(target_square, piecelist, coordlist) {
        for (let index = 0; index < coordlist.length; index++){
            if (piece_threatens_square(index, target_square, piecelist, coordlist)) return true;
        }
        return false;
    }

    function get_black_legal_moves(piecelist, coordlist) {
        let black_legal_moves = [];
        for (let square of royal_moves){
            if (!square_is_threatened(square, piecelist, coordlist)) black_legal_moves.push(square);
        }
        return black_legal_moves;
    }

    function is_mate(piecelist, coordlist) {
        if (get_black_legal_moves(piecelist, coordlist).length == 0 && square_is_threatened([0, 0], piecelist, coordlist)) return true;
        else return false;
    }

    function is_stalemate(piecelist, coordlist) {
        if (get_black_legal_moves(piecelist, coordlist).length == 0 && !square_is_threatened([0, 0], piecelist, coordlist)) return true;
        else return false;
    }

    async function runEngine(gamefile) {
        // parse gamefile into engine readable format

        // get coordinates and type of black royal piece
        let gamefile_royal_coords;
        if (gamefile.ourPieces["kingsB"].length != 0){
            gamefile_royal_coords = gamefile.ourPieces["kingsB"][0];
            royal_moves = king_moves;
        } else if (gamefile.ourPieces["royalCentaursB"].length != 0) {
            gamefile_royal_coords = gamefile.ourPieces["royalCentaursB"][0];
            royal_moves = centaur_moves;
        } else {
            return console.error("No black king or royal centaur found in game");
        }

        // create list of types and coords of white pieces
        start_piecelist = [];
        start_coordlist = [];
        for (let key in gamefile.piecesOrganizedByKey) {
            const pieceType = gamefile.piecesOrganizedByKey[key];
            if (math.getWorBFromType(pieceType) != "W") continue;
            let coords = math.getCoordsFromKey(key);
            start_piecelist.push(pieceNameDictionary[pieceType]);
            start_coordlist.push([coords[0] - gamefile_royal_coords[0], coords[1] - gamefile_royal_coords[1]]);
        }

        return engineRandomRoyalMoves.runEngine(gamefile);
    }    

    return Object.freeze({
        runEngine
    })

})();