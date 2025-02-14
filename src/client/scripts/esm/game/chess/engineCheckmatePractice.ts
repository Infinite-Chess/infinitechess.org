
/**
 * This script runs a chess engine for checkmate practice that computes the best move for the black royal piece.
 * It is called as a WebWorker from enginegame.js so that it can run asynchronously from the rest of the website.
 * You may specify a different engine to be used by specifying a different engine name in the gameOptions when initializing an engine game.
 * 
 * @author Andreas Tsevas
 */

/**
 * Typescript types are erased during compilation, so adding these
 * here doesn't actually mean adding dependancies.
 */
// @ts-ignore
import type gamefile from "../../chess/logic/gamefile";
import type { MoveDraft } from "../../chess/logic/movepiece";
import type { Coords } from "../../chess/util/coordutil";
import type { Vec2 } from "../../util/math";
// If the Webworker during creation is not declared as a module, than type imports will have to be imported this way:
// type gamefile = import("../../chess/logic/gamefile").default;
// type MoveDraft = import("../../chess/logic/movepiece").MoveDraft;
// type Coords = import("../../chess/util/coordutil").Coords;
// type Vec2 = import("../../util/math").Vec2;



/* eslint-disable max-depth */

// Here, the engine webworker received messages from the outside
self.onmessage = function(e: MessageEvent) {
	const message = e.data;
	const gamefile = message.gamefile;
	checkmateSelectedID = message.engineConfig.checkmateSelectedID;
	runEngine(gamefile);
};

// the ID of the currently selected checkmate
let checkmateSelectedID: string;

// The informtion that is currently considered best by this engine
// Whenever this gets initialized or updated, the engine WebWorker should send a message to the main thread!!
let globallyBestMove: Coords = [0,0];
let globallyBestScore: number = -Infinity;
let globalPliesToMate: number = Infinity;

// the real coordinates of the black royal piece in the gamefile
let gamefile_royal_coords: Coords;

// Black royal piece properties. The black royal piece is always at square [0,0]
const king_moves: Coords[] = [ 
	[-1,  1], [0,  1], [1,  1],
	[-1,  0],          [1,  0],
	[-1, -1], [0, -1], [1, -1],
];
const centaur_moves: Coords[] = [ 
			  [-1,  2],          [1,  2],
	[-2,  1], [-1,  1], [0,  1], [1,  1], [2,  1],
			  [-1,  0],          [1,  0],
	[-2, -1], [-1, -1], [0, -1], [1, -1], [2, -1],
			  [-1, -2],          [1, -2]
];

let royal_moves: Coords[]; // king_moves or centaur_moves
let royal_type: 'k' | 'rc'; // "k" or "rc"

// White pieces. Their coordinates are relative to the black royal
let start_piecelist: number[]; // list of white pieces in starting position, like [3,4,4,4,2, ... ]. Meaning of numbers given by pieceNameDictionary
let start_coordlist: Coords[]; // list of tuples, like [[2,3], [5,6], [6,7], ...], pieces are corresponding to ordering in start_piecelist

// only used for parsing in the position
const pieceNameDictionary: { [pieceType: string]: number } = {
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
const pieceTypeDictionary: { [key: number]: { rides?: Vec2[], jumps?: Vec2[], is_royal?: boolean, is_pawn?: boolean } } = {
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
const shortRangeJumpDictionary: { [key: number]: number } = {
	4: 5, // knight
	5: 4, // king - cannot be captured
	6: 4, // pawn
	7: 5, // amazon
	8: 8, // hawk
	9: 5, // chancellor
	10: 5, // archbishop
};

// weights for the evaluation function
let pieceExistenceEvalDictionary: { [key: number]: number };
// eslint-disable-next-line no-unused-vars
let distancesEvalDictionary: { [key: number]: [number, (square: Coords) => number][] };
let legalMoveEvalDictionary: { [key: number]: { [key: number]: number } };

// whether to consider white pawn moves as candidate moves
let ignorepawnmoves: boolean;

// number of candidate squares for white rider pieces to consider along a certain direction (2*wiggleroom + 1)
let wiggleroom: number;

/**
 * This method initializes the weights the evaluation function according to the checkmate ID provided, as well as global search properties
 */
function initEvalWeightsAndSearchProperties() {

	// default: ignoring white pawns moves as candidate moves makes engine much stronger at low depths
	ignorepawnmoves = true;

	// default
	wiggleroom = 2;

	// weights for piece values of white pieces
	pieceExistenceEvalDictionary = {
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
	distancesEvalDictionary = {
		1: [[2, manhattanNorm], [2, manhattanNorm]], // queen
		2: [[2, manhattanNorm], [2, manhattanNorm]], // rook
		3: [[2, manhattanNorm], [2, manhattanNorm]], // bishop
		4: [[15, manhattanNorm], [15, manhattanNorm]], // knight
		5: [[30, manhattanNorm], [30, manhattanNorm]], // king
		6: [[200, pawnNorm], [200, pawnNorm]], // pawn
		7: [[14, manhattanNorm], [14, manhattanNorm]], // amazon
		8: [[16, manhattanNorm], [16, manhattanNorm]], // hawk
		9: [[2, manhattanNorm], [2, manhattanNorm]], // chancellor
		10: [[16, manhattanNorm], [16, manhattanNorm]], // archbishop
		11: [[16, manhattanNorm], [16, manhattanNorm]], // knightrider
	};

	// eval scores for number of legal moves of black royal
	if (royal_type === "k") {
		legalMoveEvalDictionary = {
			// in check
			0: {
				0: -Infinity, // checkmate
				1: -75,
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
				1: -60,
				2: -45,
				3: -22,
				4: -10,
				5: -6,
				6: -3,
				7: -1,
				8: 0
			}
		};
	} else {
		legalMoveEvalDictionary = {
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
			}
		};
	}

	// variant-specific modifications to the weights:
	switch (checkmateSelectedID) {
		case "1K1Q1P-1k":
			distancesEvalDictionary[1] = [[-5, manhattanNorm], [-5, manhattanNorm]]; // queen
			distancesEvalDictionary[5] = [[0, () => 0], [0, () => 0]]; // king
			break;
		case "2AM-1rc":
			wiggleroom = 1;
			break;
		case "1K2N7B-1k":
			distancesEvalDictionary[4] = [[30, knightmareNorm], [30, knightmareNorm]]; // knight
			legalMoveEvalDictionary = {
				// in check
				0: {
					0: -Infinity, // checkmate
					1: -250,
					2: -220,
					3: -190,
					4: -160,
					5: -120,
					6: -90,
					7: -60,
					8: 0
				},
				// not in check
				1: {
					0: Infinity, // stalemate
					1: -220,
					2: -190,
					3: -160,
					4: -130,
					5: -100,
					6: -70,
					7: -40,
					8: 0
				}
			};
			break;
		case "1K3NR-1k":
			wiggleroom = 1;
			break;
	}
}

// computes the 2-norm of a square
function diagonalNorm(square: Coords): number {
	return Math.sqrt(square[0] ** 2 + square[1] ** 2);
}

// computes the squared 2-norm of a square
function diagonalNormSquared(square: Coords): number {
	return square[0] ** 2 + square[1] ** 2;
}

// computes the manhattan norm of a square
function manhattanNorm(square: Coords): number {
	return Math.abs(square[0]) + Math.abs(square[1]);
}

// special norm for the pawn
// the pawn is more threatening if it has a negative y-coordinate
function pawnNorm(square: Coords): number {
	return diagonalNorm(square) + manhattanNorm(square);
}

// special norm for the knight, which gives a massive malus to the knight near the black king for black
function knightmareNorm(square: Coords): number {
	const diagnormsquared = diagonalNormSquared(square);
	const penalty = diagnormsquared < 3 ? -16 : ( diagnormsquared < 9 ? -8 : (diagnormsquared < 19 ? -4 : 0));
	return manhattanNorm(square) + penalty;
}

/**
 * Checks if v is a multiple of direction, and returns a boolean and the factor
 * @param v - vector like [10,20]
 * @param direction - vector like [1,2]
 * @returns like [boolean, scalar multiple factor]
 */
function is_natural_multiple(v: Vec2, direction: Vec2): [boolean, number] {
	let scalar: number;
	if (direction[0] !== 0) scalar = v[0] / direction[0];
	else scalar = v[1] / direction[1];

	return [scalar > 0 && scalar * direction[0] === v[0] && scalar * direction[1] === v[1], scalar];
}

// checks if a rider on a given square threatens a given target square
// exclude_white_piece_squares specifies whether to exclude occupied squares from being threatened
// ignore_blockers specifies whether to completely ignore blocking pieces in piecelist&coordlist
// threatening_own_square specifies whether a piece can threaten its own square
function rider_threatens(direction: Vec2, piece_square: Coords, target_square: Coords, piecelist: number[], coordlist: Coords[],
	{ exclude_white_piece_squares = false, ignore_blockers = false, threatening_own_square = false} = {}): boolean {
	if (threatening_own_square && squares_are_equal(piece_square, target_square)) return true;
	const [works, distance] = is_natural_multiple([target_square[0] - piece_square[0], target_square[1] - piece_square[1]], direction);
	if (!works) return false;
	if (ignore_blockers) return true;
	// loop over all potential blockers
	for (let i = 0; i < coordlist.length; i++) {
		if (piecelist[i] === 0) continue;
		const [collinear, thispiecedistance] = is_natural_multiple([coordlist[i]![0]! - piece_square[0]!, coordlist[i]![1]! - piece_square[1]!], direction);
		if (!collinear) continue;
		if (exclude_white_piece_squares && thispiecedistance <= distance) return false;
		else if (thispiecedistance < distance) return false;
	}
	return true;
}

// adds two squares
function add_move(square: Coords, v: Vec2): Coords {
	return [square[0] + v[0], square[1] + v[1]];
}

// stretches vector by scalar
function rescaleVector(scalar: number, v: Vec2): Vec2 {
	return [scalar * v[0], scalar * v[1]];
}

// computes the cross product of two vectors
function crossProduct(v1: Vec2, v2: Vec2): number {
	return v1[0] * v2[1] - v1[1] * v2[0];
}

// checks if two squares are equal
function squares_are_equal(square_1: Coords, square_2: Coords): boolean {
	return (square_1[0] === square_2[0]) && (square_1[1] === square_2[1]);
}

// checks if a list of squares contains a given square
function tuplelist_contains_tuple(tuplelist: Coords[], tuple: Coords): boolean {
	return tuplelist.some((entry) => squares_are_equal(entry, tuple));
}

// checks if a square is occupied by a white piece
function square_is_occupied(square: Coords, piecelist: number[], coordlist: Coords[]): boolean {
	return coordlist.some((entry, index) => piecelist[index] !== 0 && squares_are_equal(entry, square));
}

// checks if a white piece at index piece_index in the piecelist&coordlist threatens a given square
function piece_threatens_square(piece_index: number, target_square: Coords, piecelist: number[], coordlist: Coords[]): boolean {
	const piece_type = piecelist[piece_index]!;

	// piece no longer exists
	if (piece_type === 0) return false;

	const piece_properties = pieceTypeDictionary[piece_type]!;
	const piece_square = coordlist[piece_index]!;

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
		for (const ride_directrion of piece_properties.rides) {
			if (rider_threatens(ride_directrion, piece_square, target_square, piecelist, coordlist)) return true;
		}
	}

	return false;
}

// checks if any white piece threatens a given square
function square_is_threatened(target_square: Coords, piecelist: number[], coordlist: Coords[]): boolean {
	for (let index = 0; index < coordlist.length; index++) {
		if (piece_threatens_square(index, target_square, piecelist, coordlist)) return true;
	}
	return false;
}

/**
 * Computes an array of all the squares that the black royal can legally move to in the given position
 */
function get_black_legal_moves(piecelist: number[], coordlist: Coords[]): Coords[] {
	return royal_moves.filter((square) => !square_is_threatened(square, piecelist, coordlist));
}

/**
 * Computes the number of squares that the black royal can legally move to in the given position
 */
function get_black_legal_move_amount(piecelist: number[], coordlist: Coords[]): number {
	return get_black_legal_moves(piecelist, coordlist).length;
}

// checks if the black royal is in check
function is_check(piecelist: number[], coordlist: Coords[]): boolean {
	return square_is_threatened([0, 0], piecelist, coordlist);
}


// Unused functions
/*
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
*/

// calculate a list of interesting squares to move to for a white piece with a certain piece index
function get_white_piece_candidate_squares(piece_index: number, piecelist: number[], coordlist: Coords[]): Coords[] {
	const candidate_squares: Coords[] = [];

	const piece_type = piecelist[piece_index]!;

	// piece no longer exists
	if (piece_type === 0) return candidate_squares;

	const piece_properties = pieceTypeDictionary[piece_type]!;
	const piece_square = coordlist[piece_index]!;

	if (ignorepawnmoves && piece_properties.is_pawn) return candidate_squares;

	// jump moves
	if (piece_properties.jumps) {
		const num_jumps = piece_properties.jumps.length;
		const shortrangeLimit = shortRangeJumpDictionary[piece_type]!;
		let best_target_square: Coords;
		let bestmove_distance = Infinity;
		let bestmove_diagSquaredNorm = Infinity;
		for (let move_index = 0; move_index < num_jumps; move_index++) {
			const target_square = add_move(piece_square, piece_properties.jumps[move_index]!);
			// do not jump onto an occupied square
			if (square_is_occupied(target_square, piecelist, coordlist)) continue;
			// do not move a royal piece onto a square controlled by black
			if (piece_properties.is_royal && tuplelist_contains_tuple(royal_moves, target_square)) continue;
			// check if target_square is a royal move
			if (tuplelist_contains_tuple(royal_moves, target_square)) {
				let blunders_piece = true;
				// create copy of piece list without piece at piece_index
				const temp_piecelist = [...piecelist];
				temp_piecelist[piece_index] = 0;
				// only consider target square if another piece defends it as well, else it will be captured
				for (let index = 0; index < coordlist.length; index++) {
					if (index !== piece_index && piece_threatens_square(index, target_square, temp_piecelist, coordlist)) {
						blunders_piece = false;
						break;
					}
				}
				if (blunders_piece) continue;
			} 
			const target_distance = manhattanNorm(target_square);
			const target_diagSquaredNorm = diagonalNormSquared(target_square); // tiebreaker
			// only add jump moves that are short range in relation to black king
			if (target_distance <= shortrangeLimit) {
				candidate_squares.push(target_square);
			}
			// keep single jump move nearest to the black king in memory
			else if (target_distance < bestmove_distance || (target_distance === bestmove_distance && target_diagSquaredNorm < bestmove_diagSquaredNorm)) {
				bestmove_distance = target_distance;
				bestmove_diagSquaredNorm = target_diagSquaredNorm;
				best_target_square = target_square;
			}
		}
		// if no jump move has been added and piece has no ride moves, add single best jump move as candidate
		if (candidate_squares.length === 0 && !piece_properties.rides) candidate_squares.push(best_target_square!);
	}

	// ride moves
	if (piece_properties.rides) {
		const num_directions = piece_properties.rides.length;
		// check each pair of rider directions v1 and v2.
		// Project them onto the square coordinates by solving c1*v1 + c2*v2 == - piece_square.
		// only works if movement directions are not collinear
		// See https://math.stackexchange.com/a/1307635/998803
		for (let i1 = 0; i1 < num_directions; i1++) {
			const v1 = piece_properties.rides[i1]!;
			for (let i2 = i1 + 1; i2 < num_directions; i2++) {
				const v2 = piece_properties.rides[i2]!;
				const denominator = crossProduct(v1, v2);
				if (denominator === 0) continue;
				const c1 = crossProduct(v2, piece_square) / denominator;
				const c2 = - crossProduct(v1, piece_square) / denominator;
				if (c1 < 0 || c2 <= 0) continue;
				// suitable values for c1 and c2 were found, now compute min and max values for c1 and c2 to consider
				const c1_min = Math.ceil(c1 - wiggleroom);
				const c1_max = Math.floor(c1 + wiggleroom);
				const c2_min = Math.ceil(c2 - wiggleroom);
				const c2_max = Math.floor(c2 + wiggleroom);

				// adds suitable squares along v1 to the candidates list
				add_suitable_squares_to_candidate_list(
					candidate_squares, piece_index, piece_square, v1, v2,
					c1_min, c1_max, c2_min, c2_max, piecelist, coordlist
				);

				// adds suitable squares along v2 to the candidates list
				add_suitable_squares_to_candidate_list(
					candidate_squares, piece_index, piece_square, v2, v1,
					c2_min, c2_max, c1_min, c1_max, piecelist, coordlist
				);
			}
		}
	}

	return candidate_squares;
}

// adds suitable squares along v1 to the candidates list, using v2 as the attack vector towards the king
function add_suitable_squares_to_candidate_list(
	candidate_squares: Coords[], piece_index: number, piece_square: Coords, v1: Vec2, v2: Vec2,
	c1_min: number, c1_max: number, c2_min: number, c2_max: number, piecelist: number[], coordlist: Coords[]
) {
	// iterate through all candidate squares in v1 direction
	candidates_loop:
	for (let rc1 = c1_min; rc1 <= c1_max; rc1++) {
		const target_square = add_move(piece_square, rescaleVector(rc1, v1));
		// do not add square already in candidates list
		if (tuplelist_contains_tuple(candidate_squares, target_square)) continue candidates_loop;
		const square_near_king_1 = add_move(target_square, rescaleVector(c2_min, v2));
		const square_near_king_2 = add_move(target_square, rescaleVector(c2_max, v2));
		// ensure that piece threatens target square
		if (!rider_threatens(v1, piece_square, target_square, piecelist, coordlist, {exclude_white_piece_squares: true})) continue;
		// ensure that target square threatens square near black king
		if (!rider_threatens(v2, target_square, square_near_king_1, piecelist, coordlist, {threatening_own_square: true}) &&
			!rider_threatens(v2, target_square, square_near_king_2, piecelist, coordlist, {threatening_own_square: true})
		) continue;
		// check if target_square is a royal move
		if (tuplelist_contains_tuple(royal_moves, target_square)) {
			// create copy of piece list without piece at piece_index
			const temp_piecelist = [...piecelist];
			temp_piecelist[piece_index] = 0;
			// only add target square if another piece defends it as well, else it will be captured
			for (let index = 0; index < coordlist.length; index++) {
				if (index !== piece_index && piece_threatens_square(index, target_square, temp_piecelist, coordlist)) {
					candidate_squares.push(target_square);
					continue candidates_loop;
				}
			}
		} 
		// target square is not a royal move
		else {
			// loop over all accepted candidate squares to eliminate reduncancies with new square
			redundancy_loop:
			for (let i = 0; i < candidate_squares.length; i++) {
				// skip over accepted candidate square if it is a royal move
				if (tuplelist_contains_tuple(royal_moves, candidate_squares[i]!)) continue redundancy_loop;
				// skip over accepted candidate square if its coords have a different sign from the current candidate square
				else if (Math.sign(target_square[0]!) !== Math.sign(candidate_squares[i]![0]!)) continue redundancy_loop;
				else if (Math.sign(target_square[1]!) !== Math.sign(candidate_squares[i]![1]!)) continue redundancy_loop;
				// eliminate current candidate square if it lies on the same line as accepted candidate square, but further away
				else if (rider_threatens(v2, target_square, candidate_squares[i]!, piecelist, coordlist, {ignore_blockers: true})) continue candidates_loop;
				// replace accepted candidate square with current candidate square if they lie on the same line as, but new square is nearer
				else if (rider_threatens(v2, candidate_squares[i]!, target_square, piecelist, coordlist, {ignore_blockers: true})) {
					candidate_squares[i] = target_square;
					continue candidates_loop;
				}
			}
			candidate_squares.push(target_square);
		}
	}
}

// calculate a list of interesting moves for the white pieces in the position given by piecelist&coordlist
function get_white_candidate_moves(piecelist: number[], coordlist: Coords[]): Coords[][] {
	const candidate_moves: Coords[][] = [];
	for (let piece_index = 0; piece_index < piecelist.length; piece_index++) {
		candidate_moves.push(get_white_piece_candidate_squares(piece_index, piecelist, coordlist));
	}
	return candidate_moves;
}

/**
 * Updates the position by moving the piece given by piece_index to target_square
 */
function make_white_move(piece_index: number, target_square: Coords, piecelist: number[], coordlist: Coords[]): [number[], Coords[]] {
	const new_piecelist = piecelist.map(a => {return a;});
	const new_coordlist = coordlist.map(a => {return [...a];}) as Coords[];
	new_coordlist[piece_index] = target_square;

	return [new_piecelist, new_coordlist];
}

/**
 * Given a direction that the black royal moves to, this shifts all white pieces relative to [0,0] and returns an updated piecelist&coordlist
 */
function make_black_move(move: Coords, piecelist: number[], coordlist: Coords[]): [number[], Coords[]] {
	const new_piecelist: number[] = [];
	const new_coordlist: Coords[] = [];
	for (let i = 0; i < piecelist.length; i++) {
		if (move[0]! === coordlist[i]![0]! && move[1]! === coordlist[i]![1]!) {
			// white piece is captured
			new_piecelist.push(0);
		} else {
			// white piece is not captured
			new_piecelist.push(piecelist[i]!);
		}
		// shift coordinates
		new_coordlist.push(add_move(coordlist[i]!, [-move[0]!, -move[1]!]));
	}

	return [new_piecelist, new_coordlist];
}

/**
 * Returns an evaluation score for a given position according to the evaluation dictionaries
 * TODO: cap distance function when white to move
 * @param {Array} piecelist 
 * @param {Array} coordlist 
 * @param {Boolean} black_to_move - false on white's turns, true on black's turns
 * @returns {Number}
 */
function get_position_evaluation(piecelist: number[], coordlist: Coords[], black_to_move: boolean): number {
	let score = 0;

	// add penalty based on number of legal moves of black royal
	const incheck = is_check(piecelist, coordlist);
	score += legalMoveEvalDictionary[incheck ? 0 : 1]![get_black_legal_move_amount(piecelist, coordlist)]!;

	const black_to_move_num = black_to_move ? 0 : 1;
	for (let i = 0; i < piecelist.length; i++) {
		// add penalty based on existence of white pieces
		score += pieceExistenceEvalDictionary[piecelist[i]!]!;

		// add score based on distance of black royal to white shortrange pieces
		if (piecelist[i]! in distancesEvalDictionary) {
			const [weight, distancefunction] = distancesEvalDictionary[piecelist[i]!]![black_to_move_num]!;
			score += weight * distancefunction(coordlist[i]!);
		}
	}
	
	return score;
}

/**
 * Performs a standard search with alpha-beta pruning through the game tree and returns the best score and move for black it finds
 * @param {Array} piecelist 
 * @param {Array} coordlist 
 * @param {Number} depth 
 * @param {Number} start_depth - does not get changed at all during recursion
 * @param {Boolean} black_to_move 
 * @param {Number} alpha 
 * @param {Number} beta 
 * @param {Number} alphaDepth 
 * @param {Number} betaDepth 
 * @returns {Object} with properties "score", "move" and "termination_depth"
 */
function alphabeta(piecelist: number[], coordlist: Coords[], depth: number, start_depth: number, black_to_move: boolean, alpha: number, beta: number, alphaDepth: number, betaDepth: number): { score: number, bestMove?: Coords, termination_depth: number } {
	if (depth === 0 || ( black_to_move && get_black_legal_move_amount(piecelist, coordlist) === 0) ) {
		return {score: get_position_evaluation(piecelist, coordlist, black_to_move), termination_depth: depth};
	}

	let bestMove: Coords | undefined;

	if (black_to_move) {
		let maxScore = -Infinity;
		let deepestDepth = depth;
		for (const move of get_black_legal_moves(piecelist, coordlist)) {
			const [new_piecelist, new_coordlist] = make_black_move(move, piecelist, coordlist);
			const evaluation = alphabeta(new_piecelist, new_coordlist, depth - 1, start_depth, false, alpha, beta, alphaDepth, betaDepth);
			const new_score = evaluation.score;
			const termination_depth = evaluation.termination_depth;
			if (new_score >= maxScore) {
				if (new_score > maxScore || termination_depth < deepestDepth || (termination_depth === deepestDepth && Math.random() < 0.5)) {
					bestMove = move;
					maxScore = new_score;
					deepestDepth = termination_depth;
					if (depth === start_depth && new_score > globallyBestScore && globalPliesToMate >= start_depth - termination_depth) {
						globallyBestMove = move;
						globallyBestScore = new_score;
						globalPliesToMate = Math.min(globalPliesToMate, termination_depth > 0 ? start_depth - termination_depth : Infinity);
						self.postMessage(move_to_gamefile_move(globallyBestMove));
					}
				}
			}
			alpha = Math.max(alpha, new_score);
			alphaDepth = Math.min(alphaDepth, termination_depth);
			if (beta <= alpha && betaDepth >= alphaDepth) {
				break;
			}
		}
		if (!bestMove) bestMove = get_black_legal_moves(piecelist, coordlist)[0];
		return { score: maxScore, bestMove: bestMove, termination_depth: deepestDepth};
	} else {
		let minScore = Infinity;
		let highestDepth = 0;
		const candidate_moves = get_white_candidate_moves(piecelist, coordlist);
		// go through pieces for in increasing order of what piece has how many candidate moves
		const indices = [...Array(piecelist.length).keys()];
		indices.sort((a, b) => { return candidate_moves[a]!.length - candidate_moves[b]!.length; });
		for (const piece_index of indices) {
			for (const target_square of candidate_moves[piece_index]!) {
				const [new_piecelist, new_coordlist] = make_white_move(piece_index, target_square, piecelist, coordlist);
				const evaluation = alphabeta(new_piecelist, new_coordlist, depth - 1, start_depth, true, alpha, beta, alphaDepth, betaDepth);
				const new_score = evaluation.score;
				const termination_depth = evaluation.termination_depth;
				if (new_score <= minScore) {
					if (new_score < minScore || termination_depth > highestDepth || (termination_depth === highestDepth && Math.random() < 0.5)) {
						minScore = new_score;
						highestDepth = termination_depth;
					}
				}
				beta = Math.min(beta, new_score);
				betaDepth = Math.max(betaDepth, termination_depth);
				if (beta <= alpha && betaDepth >= alphaDepth) {
					break;
				}
			}
		}
		return { score: minScore, termination_depth: highestDepth };
	}
}

/**
 * Performs a search with alpha-beta pruning through the game tree with iteratively greater depths
 */
function runIterativeDeepening(piecelist: number[], coordlist: Coords[], maxdepth: number): void {
	// immediately initialize and submit globallyBestMove, in case the engine gets immediately interrupted
	const black_moves = get_black_legal_moves(piecelist, coordlist);
	globallyBestMove = black_moves[Math.floor(Math.random() * black_moves.length)]!;
	const [new_piecelist, new_coordlist] = make_black_move(globallyBestMove, piecelist, coordlist);
	globallyBestScore = get_position_evaluation(new_piecelist, new_coordlist, false);
	self.postMessage(move_to_gamefile_move(globallyBestMove));
	
	// iteratively deeper and deeper search
	for (let depth = 1; depth <= maxdepth; depth = depth + 2) {
		const evaluation = alphabeta(piecelist, coordlist, depth, depth, true, -Infinity, Infinity, depth, 0);
		globallyBestMove = evaluation.bestMove!;
		globallyBestScore = evaluation.score;
		globalPliesToMate = evaluation.termination_depth > 0 ? depth - evaluation.termination_depth : Infinity;
		self.postMessage(move_to_gamefile_move(globallyBestMove));
		// console.log(`Depth ${depth}, Plies To Mate: ${globalPliesToMate}, Best score: ${globallyBestScore}, Best move by Black: ${globallyBestMove}.`);
	}
}

/**
 * Converts a target square for the black king to move to into a Move Object, taking into account gamefile_royal_coords
 */
function move_to_gamefile_move(target_square: Coords): MoveDraft {
	const endCoords: Coords = [gamefile_royal_coords[0] + target_square[0], gamefile_royal_coords[1] + target_square[1]];
	return { startCoords: gamefile_royal_coords, endCoords: endCoords };
}

/**
 * This function is called from outside and initializes the engine calculation given the provided gamefile
 */
function runEngine(gamefile: gamefile): void {
	try {
		// get real coordinates and parse type of black royal piece
		if (gamefile.ourPieces.kingsB.length !== 0) {
			gamefile_royal_coords = gamefile.ourPieces.kingsB[0]!;
			royal_moves = king_moves;
			royal_type = "k";
		} else if (gamefile.ourPieces.royalCentaursB.length !== 0) {
			gamefile_royal_coords = gamefile.ourPieces.royalCentaursB[0]!;
			royal_moves = centaur_moves;
			royal_type = "rc";
		} else {
			return console.error("No black king or royal centaur found in game");
		}

		// create list of types and coords of white pieces, in order to initialize start_piecelist and start_coordlist
		start_piecelist = [];
		start_coordlist = [];
		for (const key in gamefile.piecesOrganizedByKey) {
			const pieceType = gamefile.piecesOrganizedByKey[key]!;
			if (pieceType.slice(-1) !== "W") continue; // ignore nonwhite pieces
			const coords = key.split(',').map(Number);
			start_piecelist.push(pieceNameDictionary[pieceType]!);
			// shift all white pieces, so that the black royal is at [0,0]
			start_coordlist.push([coords[0]! - gamefile_royal_coords[0]!, coords[1]! - gamefile_royal_coords[1]!]);
		}

		// initialize the eval function weights and global search properties
		initEvalWeightsAndSearchProperties();

		// run iteratively deepened move search
		runIterativeDeepening(start_piecelist, start_coordlist, Infinity);

		/*
		let string = "";
		let candidate_move_count = 0;
		const candidate_moves = get_white_candidate_moves(start_piecelist, start_coordlist);
		for (let i=0; i<start_coordlist.length; i++){
			candidate_move_count += candidate_moves[i].length;
			string += `Piece at: ${start_coordlist[i]} 
			move to ${candidate_moves[i]}
			total amount: ${candidate_moves[i].length}\n`;
		}
		// console.log(`Total move count: ${candidate_move_count}`)
		console.log(string + `Total move count: ${candidate_move_count}`)
		*/

	} catch (e) {
		console.error("An error occured in the engine computation of the checkmate practice");
		console.error(e);
	}
}
