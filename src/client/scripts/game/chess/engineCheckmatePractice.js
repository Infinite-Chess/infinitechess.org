/**
 * This script runs a chess engine for checkmate practice that computes the best move for the black royal piece.
 * runEngine(gamefile) is the only function that is called from the outside.
 * You may specify a different engine to be used by specifying a different engine name in the gameOptions when initializing an engine game.
 */

"use strict";


const engineCheckmatePractice = (function(){
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
    let royal_moves; // king_moves or centaur_moves
    let royal_type; // "k" or "rc"

    // White pieces. Their coordinates are relative to the black royal
    let start_piecelist; // list of white pieces in starting position, like [3,4,4,4,2, ... ]. Meaning of numbers given by pieceNameDictionary
    let start_coordlist; // list of tuples, like [[2,3], [5,6], [6,7], ...], pieces are corresponding to ordering in start_piecelist

    // only used for parsing in the position
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
    };

    // legal move storage for pieces in piecelist
    const pieceTypeDictionary = {
        // 0 corresponds to a captured piece
        1: {rides: [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]}, // queen
        2: {rides: [[1, 0], [0, 1], [-1, 0], [0, -1]]}, // rook
        3: {rides: [[1, 1], [-1, -1], [1, -1], [-1, 1]]}, // bishop
        4: {jumps: [[1, 2], [-1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, 1], [-2, -1]]}, // knight
        5: {jumps: [[-1, 1], [0, 1], [1, 1], [-1, 0], [1, 0], [-1, -1], [0, -1], [1, -1]], is_royal: true}, // king
        6: {jumps: [[0, 1]], is_pawn: true}, //pawn
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

    // define what "short range" means for each piece. Jump moves to at least as near as the values in this table are considered shortrange
    const shortRangeJumpDictionary = {
        4: 5, // knight
        5: 4, // king - cannot be captured
        6: 4, // pawn
        7: 5, // amazon
        8: 8, // hawk
        9: 5, // chancellor
        10: 5, // archbishop
    };

    // weights for piece values of white pieces
    const pieceExistenceEvalDictionary = {
        0: 0, // 0 corresponds to a captured piece
        1: -1_000_000, // queen
        2: -800_000, // rook
        3: -100_000, // bishop
        4: -800_000, // knight
        5: 0, // king - cannot be captured
        6: -100_000, // pawn
        7: -1_000_000, // amazon
        8: -800_000, // hawk
        9: -800_000, // chancellor
        10: -800_000, // archbishop
        11: -800_000 // knightrider
    };

    // weights and distance functions for white piece distance to the black king
    // the first entry for each piece is for black to move, the second entry is for white to move
    const distancesEvalDictionary = {
        3: [[2, manhattanNorm], [2, cappedManhattanNorm]], // bishop
        4: [[15, manhattanNorm], [15, manhattanNorm]],  // knight
        5: [[30, manhattanNorm], [30, manhattanNorm]],  // king
        6: [[100, manhattanNorm], [100, manhattanNorm]], // pawn
        7: [[14, manhattanNorm], [14, cappedManhattanNorm]], // amazon
        8: [[16, manhattanNorm], [16, manhattanNorm]],  // hawk
        10: [[16, manhattanNorm], [16, cappedManhattanNorm]],  // archbishop
        11: [[16, manhattanNorm], [16, cappedManhattanNorm]],  // knightrider
    };

    // eval scores for number of legal moves of black royal
    const legalMoveEvalDictionary = {
        "k": {
            // in check
            0: {
                0: -Infinity, // checkmate
                1: -100,
                2: -50,
                3: -25,
                4: -12,
                5: -8,
                6: -4,
                7: -2,
                8: 0
            },
            // not in check
            1: {
                0: Infinity, // stalemate
                1: -90,
                2: -45,
                3: -22,
                4: -10,
                5: -6,
                6: -3,
                7: -1,
                8: 0
            },
        },
        "rc": {
            // in check
            0: {
                0: -Infinity, // checkmate
                1: -100,
                2: -90,
                3: -80,
                4: -70,
                5: -50,
                6: -40,
                7: -30,
                8: -25,
                9: -20,
                10: -15,
                11: -12.5,
                12: -10,
                13: -7.5,
                14: -5,
                15: -2.5,
                16: 0
            },
            // not in check
            1: {
                0: Infinity, // stalemate
                1: -100,
                2: -85,
                3: -75,
                4: -65,
                5: -45,
                6: -35,
                7: -25,
                8: -20,
                9: -15,
                10: -12.5,
                11: -10,
                12: -7.5,
                13: -5,
                14: -2,
                15: -1,
                16: 0
            },
        }
    };

    // computes the manhattan norm of a square
    function manhattanNorm(square) {
        return Math.abs(square[0]) + Math.abs(square[1]);
    }

    // computes min(manhattan norm, manhattancap) of a square
    function cappedManhattanNorm(square, manhattancap = 10) {
        const manhattannorm = manhattanNorm(square);
        if (manhattannorm < manhattancap) return manhattannorm;
        else return manhattancap;
    }

    /**
     * Checks if v is a multiple of direction, and returns a boolean and the factor
     * @param {number[]} v - vector like [10,20]
     * @param {number[]} direction - vector like [1,2]
     * @returns {Array} like [boolean, scalar multiple factor]
     */
    function is_natural_multiple(v, direction) {
        let scalar;
        if (direction[0] != 0) scalar = v[0] / direction[0];
        else scalar = v[1] / direction[1];

        return [scalar > 0 && scalar * direction[0] == v[0] && scalar * direction[1] == v[1], scalar];
    }

    // checks if a rider on a given square threatens a given target square
    // exclude_white_piece_squares specifies whether to exclude occupied squares from being threatened
    // ignore_blockers specifies whether to completely ignore blocking pieces in piecelist&coordlist
    // threatening_own_square specifies whether a piece can threaten its own square
    function rider_threatens(direction, piece_square, target_square, piecelist, coordlist,
        { exclude_white_piece_squares = false, ignore_blockers = false, threatening_own_square = false} = {}) {
        if (threatening_own_square && squares_are_equal(piece_square, target_square)) return true;
        const [works, distance] = is_natural_multiple([target_square[0] - piece_square[0], target_square[1] - piece_square[1]], direction);
        if (works) {
            if (ignore_blockers) return true;
            // loop over all potential blockers
            for (let i = 0; i < coordlist.length; i++) {
                if (piecelist[i] != 0) {
                    const [collinear, thispiecedistance] = is_natural_multiple([coordlist[i][0] - piece_square[0], coordlist[i][1] - piece_square[1]], direction);
                    if (collinear) {
                        if (exclude_white_piece_squares && thispiecedistance <= distance) return false;
                        else if (thispiecedistance < distance) return false;
                    }
                }
            }
            return true;
        }
        return false;
    }

    // adds two squares
    function add_move(square, v) {
        return [square[0] + v[0], square[1] + v[1]];
    }

    // stretches vector by scalar
    function rescaleVector (scalar, v) {
        return [scalar * v[0], scalar * v[1]];
    }

    // computes the scalar product of two vectors
    function scalarProduct(v1, v2) {
        return v1[0] * v2[0] + v1[1] * v2[1];
    }

    // computes the cross product of two vectors
    function crossProduct(v1, v2) {
        return v1[0] * v2[1] - v1[1] * v2[0];
    }

    // checks if two squares are equal
    function squares_are_equal(square_1, square_2) {
        return square_1[0] == square_2[0] && square_1[1] == square_2[1];
    }

    // checks if a list of squares contains a given square
    function tuplelist_contains_tuple(tuplelist, tuple) {
        for (let entry of tuplelist) {
            if (tuple[0] == entry[0] && tuple[1] == entry[1]) return true;
        }
        return false;
    }

    // checks if a square is occupied by a white piece
    function square_is_occupied(square, piecelist, coordlist) {
        for (let index = 0; index < piecelist.length; index++) {
            if (piecelist[index] != 0 && squares_are_equal(coordlist[index], square)) return true;
        }
        return false;
    }

    // checks if a white piece at index piece_index in the piecelist&coordlist threatens a given square
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
            if (squares_are_equal(add_move(piece_square, [-1, 1]), target_square) || squares_are_equal(add_move(piece_square, [1, 1]), target_square)) return true;
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

    // checks if any white piece threatens a given square
    function square_is_threatened(target_square, piecelist, coordlist) {
        for (let index = 0; index < coordlist.length; index++){
            if (piece_threatens_square(index, target_square, piecelist, coordlist)) return true;
        }
        return false;
    }

    /**
     * Computes an array of all the squares that the black royal can legally move to in the given position
     * @param {Array} piecelist 
     * @param {Array} coordlist 
     * @returns {Array}
     */
    function get_black_legal_moves(piecelist, coordlist) {
        let black_legal_moves = [];
        for (let square of royal_moves){
            if (!square_is_threatened(square, piecelist, coordlist)) black_legal_moves.push(square);
        }
        return black_legal_moves;
    }

    /**
     * Computes the number of squares that the black royal can legally move to in the given position
     * @param {Array} piecelist 
     * @param {Array} coordlist 
     * @returns {Array}
     */
    function get_black_legal_move_amount(piecelist, coordlist) {
        let black_legal_move_amount = 0;
        for (let square of royal_moves){
            if (!square_is_threatened(square, piecelist, coordlist)) black_legal_move_amount += 1;
        }
        return black_legal_move_amount;
    }

    // checks if the black royal is in check
    function is_check(piecelist, coordlist) {
        return square_is_threatened([0, 0], piecelist, coordlist);
    }

    // checks if the black royal is mated
    function is_mate(piecelist, coordlist) {
        if (get_black_legal_move_amount(piecelist, coordlist) == 0 && square_is_threatened([0, 0], piecelist, coordlist)) return true;
        else return false;
    }

    // checks if the black royal is stalemated
    function is_stalemate(piecelist, coordlist) {
        if (get_black_legal_move_amount(piecelist, coordlist) == 0 && !square_is_threatened([0, 0], piecelist, coordlist)) return true;
        else return false;
    }

    // calculate a list of interesting squares to move to for a white piece with a certain piece index
    function get_white_piece_candidate_squares(piece_index, piecelist, coordlist) {
        let candidate_squares = [];

        const piece_type = piecelist[piece_index];

        // piece no longer exists
        if (piece_type == 0) return candidate_squares;

        const piece_properties = pieceTypeDictionary[piece_type];
        const piece_square = coordlist[piece_index];

        // jump moves
        if (piece_properties.jumps) {
            const num_jumps = piece_properties.jumps.length;
            const shortrangeLimit = shortRangeJumpDictionary[piece_type];
            let best_target_square = 0;
            let bestmove_distance = Infinity;
            for (let move_index = 0; move_index < num_jumps; move_index++) {
                const target_square = add_move(piece_square, piece_properties.jumps[move_index]);
                if (square_is_occupied(target_square, piecelist, coordlist)) continue;
                const target_distance = manhattanNorm(target_square);
                // only add jump moves that are short range in relation to black king
                if (target_distance <= shortrangeLimit) {
                    candidate_squares.push(target_square);
                }
                // keep single jump move nearest to the black king in memory
                else if (target_distance < bestmove_distance) {
                    bestmove_distance = target_distance;
                    best_target_square = target_square;
                }
            }
            // if no jump move has been added and piece has no ride moves, add single best jump move as candidate
            if (candidate_squares.length == 0 && !piece_properties.rides) candidate_squares.push(best_target_square);
        }

        // ride moves
        if (piece_properties.rides) {
            const num_directions = piece_properties.rides.length;
            // check each pair of rider directions v1 and v2.
            // Project them onto the square coordinates by solving c1*v1 + c2*v2 == - piece_square.
            // only works if movement directions are not collinear
            // See https://math.stackexchange.com/a/1307635/998803
            for (let i1 = 0; i1 < num_directions; i1++) {
                const v1 = piece_properties.rides[i1];
                for (let i2 = i1 + 1; i2 < num_directions; i2++) {
                    const v2 = piece_properties.rides[i2];
                    const denominator = crossProduct(v1, v2);
                    if (denominator != 0) {
                        const c1 = crossProduct(v2, piece_square) / denominator;
                        const c2 = - crossProduct(v1, piece_square) / denominator;
                        if (c1 >= 0 && c2 > 0) {
                            // suitable values for c1 and c2 were found, now compute min and max values for c1 and c2 to consider
                            const wiggleroom = Math.abs(denominator) > 1 ? 2 : 1;
                            const c1_min = Math.ceil(c1 - wiggleroom);
                            const c1_max = Math.floor(c1 + wiggleroom);
                            const c2_min = Math.ceil(c2 - wiggleroom);
                            const c2_max = Math.floor(c2 + wiggleroom);

                            // adds suitable squares along v1 to the candidates list
                            add_suitable_squares_to_candidate_list(
                                candidate_squares, piece_square, v1, v2,
                                c1_min, c1_max, c2_min, c2_max, piecelist, coordlist
                            )

                            // adds suitable squares along v2 to the candidates list
                            add_suitable_squares_to_candidate_list(
                                candidate_squares, piece_square, v2, v1,
                                c2_min, c2_max, c1_min, c1_max, piecelist, coordlist
                            )
                        }
                    }
                }
            }
        }

        return candidate_squares;
    }

    // adds suitable squares along v1 to the candidates list, using v2 as the attack vector towards the king
    function add_suitable_squares_to_candidate_list(
        candidate_squares, piece_square, v1, v2,
        c1_min, c1_max, c2_min, c2_max, piecelist, coordlist
    ){
        // iterate through all candidate squares in v1 direction
        candidates_loop:
        for (let rc1 = c1_min; rc1 <= c1_max; rc1++) {
            const target_square = add_move(piece_square, rescaleVector(rc1, v1));
            // do not add square already in candidates list
            if (tuplelist_contains_tuple(candidate_squares, target_square)) continue candidates_loop;
            const square_near_king_1 = add_move(target_square, rescaleVector(c2_min, v2));
            const square_near_king_2 = add_move(target_square, rescaleVector(c2_max, v2));
            // ensure that piece threatens target square
            if (rider_threatens(v1, piece_square, target_square, piecelist, coordlist, {exclude_white_piece_squares: true})) {
                // ensure that target square threatens square near black king
                if (rider_threatens(v2, target_square, square_near_king_1, piecelist, coordlist, {threatening_own_square: true}) ||
                    rider_threatens(v2, target_square, square_near_king_2, piecelist, coordlist, {threatening_own_square: true})
                ) {
                    // definitely add target_square if it is a royal move
                    if (!tuplelist_contains_tuple(royal_moves, target_square)) {
                        // loop over all accepted candidate squares to eliminate reduncancies with new square
                        redundancy_loop:
                        for (let i = 0; i < candidate_squares.length; i++) {
                            // skip over accepted candidate square if it is a royal move
                            if (tuplelist_contains_tuple(royal_moves, candidate_squares[i])) continue redundancy_loop;
                            // skip over accepted candidate square if its coords have a different sign from the current candidate square
                            else if (Math.sign(target_square[0]) != Math.sign(candidate_squares[i][0])) continue redundancy_loop;
                            else if (Math.sign(target_square[1]) != Math.sign(candidate_squares[i][1])) continue redundancy_loop;
                            // eliminate current candidate square if it lies on the same line as accepted candidate square, but further away
                            else if (rider_threatens(v2, target_square, candidate_squares[i], piecelist, coordlist, {ignore_blockers: true})) continue candidates_loop;
                            // replace accepted candidate square with current candidate square if they lie on the same line as, but new square is nearer
                            else if (rider_threatens(v2, candidate_squares[i], target_square, piecelist, coordlist, {ignore_blockers: true})) {
                                candidate_squares[i] = target_square;
                                continue candidates_loop;
                            }
                        }
                    }
                    candidate_squares.push(target_square);
                }
            }
        }
    }

    // calculate a list of interesting moves for the white pieces in the position given by piecelist&coordlist
    function get_white_candidate_moves(piecelist, coordlist) {
        let candidate_moves = [];
        for (let piece_index = 0; piece_index < piecelist.length; piece_index++) {
            candidate_moves.push(get_white_piece_candidate_squares(piece_index, piecelist, coordlist))
        }
        return candidate_moves;
    }

    /**
     * Updates the position by moving the piece given by piece_index to target_square
     * @param {Array} piece_index 
     * @param {number[]} target_square 
     * @param {Array} piecelist 
     * @param {Array} coordlist 
     * @returns {Array}
     */
    function make_white_move(piece_index, target_square, piecelist, coordlist) {
        let new_piecelist = piecelist.map(a => {return [...a]});
        let new_coordlist = coordlist.map(a => {return [...a]});
        new_coordlist[piece_index] = target_square;

        return [new_piecelist, new_coordlist];
    }

    /**
     * Given a direction that the black royal moves to, this shifts all white pieces relative to [0,0] and returns an updated piecelist&coordlist
     * @param {number[]} move 
     * @param {Array} piecelist 
     * @param {Array} coordlist 
     * @returns {Array}
     */
    function make_black_move(move, piecelist, coordlist) {
        let new_piecelist = [];
        let new_coordlist = [];
        for (let i = 0; i < piecelist.length; i++) {
            if (move[0] == coordlist[i][0] && move[1] == coordlist[i][1]) {
                // white piece is captured
                new_piecelist.push(0);
            } else {
                // white piece is not captured
                new_piecelist.push(piecelist[i]);
            }
            // shift coordinates
            new_coordlist.push(add_move(coordlist[i], [-move[0], -move[1]]));
        }

        return [new_piecelist, new_coordlist];
    }

    /**
     * Returns an evaluation score for a given position according to the evaluation dictionaries
     * TODO: cap distance function when white to move
     * @param {Array} piecelist 
     * @param {Array} coordlist 
     * @param {Number} black_to_move - 0 on white's turns, 1 on black's turns
     * @returns {Number}
     */
    function get_position_evaluation(piecelist, coordlist, black_to_move) {
        let score = 0;

        // add penalty based on number of legal moves of black royal
        const incheck = is_check(piecelist, coordlist);
        score += legalMoveEvalDictionary[royal_type][incheck ? 0 : 1][get_black_legal_move_amount(piecelist, coordlist)];

        
        for (let i = 0; i < piecelist.length; i++) {
            // add penalty based on existence of white pieces
            score += pieceExistenceEvalDictionary[piecelist[i]];

            // add penalty based on distance of black royal to white shortrange pieces
            if (piecelist[i] in distancesEvalDictionary) {
                const [weight, distancefunction] = distancesEvalDictionary[piecelist[i]][black_to_move];
                score += weight * distancefunction(coordlist[i]);
            }
        }
        
        return score;
    }

    /**
     * Given a piecelist&coordlist, this function returns the best possible square that the black royal can move to
     * @param {Array} piecelist 
     * @param {Array} coordlist 
     * @returns {Array}
     */
    function get_best_next_move(piecelist, coordlist){
        let best_score = - Infinity;
        let best_move;
        for (let move of get_black_legal_moves(piecelist, coordlist)) {
            const [new_piecelist, new_coordlist] = make_black_move(move, piecelist, coordlist);
            const new_score = get_position_evaluation(new_piecelist, new_coordlist, 0);
            if (new_score > best_score || !best_move) {
                best_score = new_score;
                best_move = move;
            } else if (new_score == best_score) {
                if (Math.random() < 0.5) {
                    best_move = move;
                }
            }
        }

        return best_move;
    }

    /**
	 * This function is called from outside and initializes the engine calculation given the provided gamefile
	 * @param {gamefile} gamefile - the gamefile
	 * @returns {Promise<Move>} - promise to the move with the highest score
	 */
    async function runEngine(gamefile) {
        try {
            // get real coordinates and parse type of black royal piece
            let gamefile_royal_coords;
            if (gamefile.ourPieces["kingsB"].length != 0){
                gamefile_royal_coords = gamefile.ourPieces["kingsB"][0];
                royal_moves = king_moves;
                royal_type = "k";
            } else if (gamefile.ourPieces["royalCentaursB"].length != 0) {
                gamefile_royal_coords = gamefile.ourPieces["royalCentaursB"][0];
                royal_moves = centaur_moves;
                royal_type = "rc";
            } else {
                return console.error("No black king or royal centaur found in game");
            }

            // create list of types and coords of white pieces, in order to initialize start_piecelist and start_coordlist
            start_piecelist = [];
            start_coordlist = [];
            for (let key in gamefile.piecesOrganizedByKey) {
                const pieceType = gamefile.piecesOrganizedByKey[key];
                if (pieceType.slice(-1) != "W") continue; // ignore nonwhite pieces
                let coords = key.split(',').map(Number);
                start_piecelist.push(pieceNameDictionary[pieceType]);
                // shift all white pieces, so that the black royal is at [0,0]
                start_coordlist.push([coords[0] - gamefile_royal_coords[0], coords[1] - gamefile_royal_coords[1]]);
            }

            // For now, just make the highest scoring move available without looking any deeper into the position
            const move = get_best_next_move(start_piecelist, start_coordlist);
            const startCoords = [gamefile_royal_coords[0], gamefile_royal_coords[1]];
            const endCoords = [gamefile_royal_coords[0] + move[0], gamefile_royal_coords[1] + move[1]];

            
            let string = "";
            let candidate_move_count = 0;
            const candidate_moves = get_white_candidate_moves(start_piecelist, start_coordlist);
            for (let i=0; i<start_coordlist.length; i++){
                candidate_move_count += candidate_moves[i].length;
                string += `Piece at: ${start_coordlist[i]} 
                move to ${candidate_moves[i]}
                total amount: ${candidate_moves[i].length}\n`;
            }
            // alert(`Total move count: ${candidate_move_count}`)
            alert(string + `Total move count: ${candidate_move_count}`)
            
            await main.sleep(500) // unnecessary delay
            return {startCoords: startCoords, endCoords: endCoords};

        } catch(e) {
            console.error("An error occured in the engine computation of the checkmate practice");
            console.error(e);
        }
    }    

    return Object.freeze({
        runEngine
    })

})();