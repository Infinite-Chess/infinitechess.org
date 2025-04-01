
/**
 * This script runs a chess engine for checkmate practice that computes the best move for the black royal piece.
 * It is called as a WebWorker from enginegame.js so that it can run asynchronously from the rest of the website.
 * You may specify a different engine to be used by specifying a different engine name in the gameOptions when initializing an engine game.
 * 
 * @author Andreas Tsevas
 */

// @ts-ignore
import isprime from '../../../util/isprime.js';
// @ts-ignore
import insufficientmaterial from '../../../chess/logic/insufficientmaterial.js';

/**
 * Typescript types are erased during compilation, so adding these
 * here doesn't actually mean adding dependancies.
 */
// @ts-ignore
import type gamefile from "../../../chess/logic/gamefile";
import type { MoveDraft } from "../../../chess/logic/movepiece";
import type { Coords } from "../../../chess/util/coordutil";
import type { Vec2 } from "../../../util/math";
// If the Webworker during creation is not declared as a module, than type imports will have to be imported this way:
// type gamefile = import("../../chess/logic/gamefile").default;
// type MoveDraft = import("../../chess/logic/movepiece").MoveDraft;
// type Coords = import("../../chess/util/coordutil").Coords;
// type Vec2 = import("../../util/math").Vec2;



/* eslint-disable max-depth */

/**
 * Let the main thread know that the Worker has finished fetching and
 * its code is now executing! We may now hide the spinny pawn loading animation.
 */
postMessage('readyok');

// Here, the engine webworker received messages from the outside
self.onmessage = function(e: MessageEvent) {
	const message = e.data;
	input_gamefile = message.gamefile;
	checkmateSelectedID = message.engineConfig.checkmateSelectedID;
	engineTimeLimitPerMoveMillis = message.engineConfig.engineTimeLimitPerMoveMillis;
	globallyBestScore = -Infinity;
	globalSurvivalPlies = 0;
	globallyBestVariation = {};

	if (!engineInitialized) initEvalWeightsAndSearchProperties();	// initialize the eval function weights and global search properties
	
	engineStartTime = Date.now();
	enginePositionCounter = 0;
	runEngine();
};

/** Seeded RNG function, will be initialized in runEngine() */
let rand: Function;

/** Whether the engine has already been initialized for the current game */
let engineInitialized: boolean = false;

/** Externally supplied gamefile */
let input_gamefile : gamefile;

/** Start time of current engine calculation in millis */
let engineStartTime: number;
/** The number of positions evaluated by this engine in total during current calculation */
let enginePositionCounter: number;
/** Time limit for the engine to think in milliseconds */
let engineTimeLimitPerMoveMillis: number;

// the ID of the currently selected checkmate
let checkmateSelectedID: string;

// The informtion that is currently considered best by this engine
let globallyBestScore: number;
let globalSurvivalPlies: number;
let globallyBestVariation: { [key: number]: [number, Coords] };
// e.g. { 0: [NaN, [1,0]], 1: [3,[2,4]], 2: [NaN, [-1,1]], 3: [2, [5,6]], ... } = { 0: black move, 1: white piece index & move, 2: black move, ... }

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
	"knightridersW": 11,
	"huygensW": 12
};

function invertPieceNameDictionary(json: { [key: string]: number }) {
	const inv: { [key: number]: string } = {};
	for (const key in json) {
		inv[json[key]!] = key;
	}
	return inv;
}

const invertedPieceNameDictionaty = invertPieceNameDictionary(pieceNameDictionary);

// legal move storage for pieces in piecelist
const pieceTypeDictionary: { [key: number]: { rides?: Vec2[], jumps?: Vec2[], is_royal?: boolean, is_pawn?: boolean, is_huygen?: boolean } } = {
	0: {}, // 0 corresponds to a captured piece
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
	11: {rides: [[1, 2], [-1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, 1], [-2, -1]]}, // knightrider
	12: {jumps: [[2, 0], [-2, 0], [0, 2], [0, -2]],
		 rides: [[1, 0], [0, 1], [-1, 0], [0, -1]], is_huygen: true } // huygen
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
	12: 10, // huygen
};

// weights for the evaluation function
let pieceExistenceEvalDictionary: { [key: number]: number };
// eslint-disable-next-line no-unused-vars
let distancesEvalDictionary: { [key: number]: [number, (square: Coords) => number][] };
let legalMoveEvalDictionary: { [key: number]: { [key: number]: number } };
// eslint-disable-next-line no-unused-vars
let centerOfMassEvalDictionary: { [key: string]: [number, number, number, (square: Coords) => number][] };

// number of candidate squares for white rider pieces to consider along a certain direction (2*wiggleroom + 1)
let wiggleroomDictionary: { [key: number]: number };

// whether to consider white pawn moves as candidate moves
let ignorepawnmoves: boolean;

// whether to consider white royal moves as candidate moves
let ignoreroyalmoves: boolean;

// whether to enter "trap flee mode" whenever the black royal is surrounded by white pieces
let mayEnterTrapFleeMode: boolean;
let numOfPiecesForTrap: number;
let maxDistanceForTrap: number;
let maxDistanceForRoyal_Flee: number;
let trapFleeDictionary: { [key: string]: [number, number, number] };

// whether to enter "protected rider flee mode" whenever the black royal is near the specified protected white rider
let mayEnterProtectedRiderFleeMode: boolean;
let riderTypeToFleeFrom: number;
let maxDistanceForRider: number;
let maxDistanceForProtector: number;
let protectedRiderFleeDictionary: { [key: string]: [number, number, number] };

/**
 * This method initializes the weights the evaluation function according to the checkmate ID provided, as well as global search properties
 */
function initEvalWeightsAndSearchProperties() {

	// default
	ignorepawnmoves = false;

	// default
	ignoreroyalmoves = false;

	// default
	mayEnterTrapFleeMode = false;

	// default
	mayEnterProtectedRiderFleeMode = false;

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
		11: -800_000, // knightrider
		12: -800_000 // huygen
	};

	// weights and distance functions for white piece distance to the black king
	// the first entry for each piece is for black to move, the second entry is for white to move
	distancesEvalDictionary = {
		1: [[2, manhattanNorm], [2, manhattanNorm]], // queen
		2: [[2, manhattanNorm], [2, manhattanNorm]], // rook
		3: [[2, manhattanNorm], [2, manhattanNorm]], // bishop
		4: [[15, manhattanNorm], [15, manhattanNorm]], // knight
		5: [[30, manhattanNorm], [30, manhattanNorm]], // king
		6: [[200, specialNorm], [200, specialNorm]], // pawn
		7: [[14, manhattanNorm], [14, manhattanNorm]], // amazon
		8: [[7, manhattanNorm], [7, manhattanNorm]], // hawk
		9: [[2, manhattanNorm], [2, manhattanNorm]], // chancellor
		10: [[16, manhattanNorm], [16, manhattanNorm]], // archbishop
		11: [[16, manhattanNorm], [16, manhattanNorm]], // knightrider
		12: [[6, manhattanNorm], [6, manhattanNorm]], // huygen
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

		engineInitialized = true;
	}

	// number of candidate squares for white rider pieces to consider along a certain direction (2*wiggleroom + 1)
	wiggleroomDictionary = {
		1: 1, // queen
		2: 2, // rook
		3: 2, // bishop
		7: 1, // amazon
		9: 1, // chancellor
		10: 1, // archbishop
		11: 1, // knightrider
		12: 5 // huygen
	};

	// variant-specific weights:

	// score for distance of black royal to center of mass of white pieces of given type near black king
	// piecetype, cutoff, weight, distancefunction
	centerOfMassEvalDictionary = {
		"1K1N2B1B-1k": [[3, 14, 20, manhattanNorm], [3, 14, 20, manhattanNorm]], // bishop
		"5HU-1k": [[12, 20, 30, manhattanNorm], [12, 20, 30, manhattanNorm]], // huygen
	};

	// whether to enter "trap flee mode" whenever the black royal is surrounded by white pieces
	// numOfPiecesForTrap, maxDistanceForTrap, maxDistanceForRoyal_Flee
	trapFleeDictionary = {
		"1K2HA1B-1k": [3, 7, 10],
		"1K3HA-1k": [3, 7, 10],
	};

	if (checkmateSelectedID in trapFleeDictionary) {
		mayEnterTrapFleeMode = true;
		[numOfPiecesForTrap, maxDistanceForTrap, maxDistanceForRoyal_Flee] = trapFleeDictionary[checkmateSelectedID]!;
	}


	// whether to enter "protected rider flee mode" whenever the black royal is near the specified protected white rider
	// riderTypeToFleeFrom, maxDistanceForRider, maxDistanceForProtector
	protectedRiderFleeDictionary = {
		"1K1R2N-1k": [2, Infinity, 10], // rook
		"1K1CH1N-1k": [9, Infinity, 10], // chancellor
	};

	if (checkmateSelectedID in protectedRiderFleeDictionary) {
		mayEnterProtectedRiderFleeMode = true;
		[riderTypeToFleeFrom, maxDistanceForRider, maxDistanceForProtector] = protectedRiderFleeDictionary[checkmateSelectedID]!;
	}

	switch (checkmateSelectedID) {
		case "2Q-1k":
			wiggleroomDictionary[1] = 2; // queen
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
		case "1K1AM-1k":
			ignoreroyalmoves = true;
			legalMoveEvalDictionary = {
				// in check
				0: {
					0: -Infinity, // checkmate
					1: 0,
					2: 0,
					3: 0,
					4: 0,
					5: 0,
					6: 0,
					7: 0,
					8: 0
				},
				// not in check
				1: {
					0: Infinity, // stalemate
					1: 0,
					2: 0,
					3: 0,
					4: 0,
					5: 0,
					6: 0,
					7: 0,
					8: 0
				}
			};
			break;
		case "1K2N1B1B-1k":
			distancesEvalDictionary[3] = [[12, manhattanNorm], [12, manhattanNorm]]; // bishop
			break;
		case "1K1R1B1B-1k":
			distancesEvalDictionary[5] = [[15, specialNorm], [15, specialNorm]]; // king
			break;
		case "1K1R1N1B-1k":
			distancesEvalDictionary[4] = [[8, specialNorm], [8, specialNorm]]; // knight
			break;
		case "2K1R-1k":
			distancesEvalDictionary[5] = [[40, specialNorm], [40, specialNorm]]; // king
			break;
		case "1K2AR-1k":
			distancesEvalDictionary[10] = [[15, vincinityNorm], [15, vincinityNorm]]; // archbishop
			distancesEvalDictionary[5] = [[15, manhattanNorm], [15, manhattanNorm]]; // king
			break;
		case "2R1N1P-1k":
			ignorepawnmoves = true;
			break;
		case "1K2N6B-1k":
			distancesEvalDictionary[4] = [[30, vincinityNorm], [30, vincinityNorm]]; // knight
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
		case "1K1Q1P-1k":
			distancesEvalDictionary[1] = [[-5, manhattanNorm], [-5, manhattanNorm]]; // queen
			distancesEvalDictionary[5] = [[0, () => 0], [0, () => 0]]; // king
			break;
		case "1K3NR-1k":
			distancesEvalDictionary[5] = [[20, manhattanNorm], [20, manhattanNorm]]; // king
			legalMoveEvalDictionary = {
				// in check
				0: {
					0: -Infinity, // checkmate
					1: -25,
					2: -17,
					3: -8,
					4: -4,
					5: -3,
					6: -2,
					7: -1,
					8: 0
				},
				// not in check
				1: {
					0: Infinity, // stalemate
					1: -20,
					2: -15,
					3: -6,
					4: -3,
					5: -2,
					6: -1,
					7: -1,
					8: 0
				}
			};
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

// computes the manhattan distance of two squares
function manhattanDistance(square1: Coords, square2: Coords): number {
	return Math.abs(square1[0] - square2[0]) + Math.abs(square1[1] - square2[1]);
}

// special norm = manhattan + diagonal
function specialNorm(square: Coords): number {
	return diagonalNorm(square) + manhattanNorm(square);
}

// special norm, which gives a massive malus to the piece being near the black king for black
function vincinityNorm(square: Coords): number {
	const diagnormsquared = diagonalNormSquared(square);
	const penalty = diagnormsquared < 3 ? -16 : ( diagnormsquared < 9 ? -8 : (diagnormsquared < 19 ? -4 : 0));
	return manhattanNorm(square) + penalty;
}

// center of mass of all white pieces near the black king
function get_center_of_mass(piece_type: number, cutoff: number, piecelist: number[], coordlist: Coords[]) {
	let numpieces: number = 0;
	let center: Coords = [0,0];
	for (let i = 0; i < piecelist.length; i++) {
		if (piecelist[i] === piece_type && manhattanNorm(coordlist[i]!) <= cutoff) {
			center = add_move(center, coordlist[i]!);
			numpieces++;
		}
	}
	if (numpieces === 0) return false;
	else return rescaleVector(1. / numpieces, center);
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
function rider_threatens(direction: Vec2, piece_square: Coords, target_square: Coords, is_huygen: boolean, piecelist: number[], coordlist: Coords[],
	{ exclude_white_piece_squares = false, ignore_blockers = false, threatening_own_square = false} = {}): boolean {
	if (threatening_own_square && squares_are_equal(piece_square, target_square)) return true;
	const [works, distance] = is_natural_multiple([target_square[0] - piece_square[0], target_square[1] - piece_square[1]], direction);
	if (!works) return false;
	if (is_huygen && !isprime.primalityTest(distance, null)) return false;
	if (ignore_blockers) return true;
	// loop over all potential blockers
	for (let i = 0; i < coordlist.length; i++) {
		if (piecelist[i] === 0) continue;
		else if (exclude_white_piece_squares && squares_are_equal(coordlist[i]!, target_square)) return false;

		const [collinear, thispiecedistance] = is_natural_multiple([coordlist[i]![0]! - piece_square[0]!, coordlist[i]![1]! - piece_square[1]!], direction);
		if (!collinear) continue;
		else if (is_huygen && !isprime.primalityTest(thispiecedistance, null)) continue;
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
			const is_huygen = (piece_properties.is_huygen ? true : false);
			if (rider_threatens(ride_directrion, piece_square, target_square, is_huygen, piecelist, coordlist)) return true;
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
function get_black_legal_moves(inTrapFleeMode: boolean, piecelist: number[], coordlist: Coords[]): Coords[] {
	// If black is in flee mode, he cannot capture white pieces
	return royal_moves.filter((square) => !square_is_threatened(square, piecelist, coordlist) && !(inTrapFleeMode && square_is_occupied(square, piecelist, coordlist)) );
}

/**
 * Computes the number of squares that the black royal can legally move to in the given position
 */
function get_black_legal_move_amount(inTrapFleeMode: boolean, piecelist: number[], coordlist: Coords[]): number {
	return get_black_legal_moves(inTrapFleeMode, piecelist, coordlist).length;
}

// checks if the black royal is in check
function is_check(piecelist: number[], coordlist: Coords[]): boolean {
	return square_is_threatened([0, 0], piecelist, coordlist);
}


// Unused functions
/*
// checks if the black royal is mated
function is_mate(inTrapFleeMode, piecelist, coordlist) {
	if (get_black_legal_move_amount(inTrapFleeMode, piecelist, coordlist) == 0 && square_is_threatened([0, 0], piecelist, coordlist)) return true;
	else return false;
}

// checks if the black royal is stalemated
function is_stalemate(inTrapFleeMode, piecelist, coordlist) {
	if (get_black_legal_move_amount(inTrapFleeMode, piecelist, coordlist) == 0 && !square_is_threatened([0, 0], piecelist, coordlist)) return true;
	else return false;
}
*/

// determine if black is surrounded by at least numOfPiecesForTrap nonroyal white pieces
function isBlackInTrap(piecelist: number[], coordlist: Coords[]) {
	let nearbyNonroyalWhites = 0;
	for (let i = 0; i < piecelist.length; i++) {
		if (piecelist[i]! !== 0 && manhattanNorm(coordlist[i]!) <= maxDistanceForTrap) {
			if (!pieceTypeDictionary[piecelist[i]!]!.is_royal) nearbyNonroyalWhites++;
			// black is not in trap if white royal is nearby
			else if (manhattanNorm(coordlist[i]!) <= maxDistanceForRoyal_Flee) return false;
		}
	}
	// black is surrounded by at least numOfPiecesForTrap nonroyal white pieces
	return (nearbyNonroyalWhites >= numOfPiecesForTrap);
}

// determine if black is near specified protected rider
function isBlackNearProtectedRider(piecelist: number[], coordlist: Coords[]) {
	for (let i = 0; i < piecelist.length; i++) {
		if (piecelist[i] === riderTypeToFleeFrom) {
			if (manhattanNorm(coordlist[i]!) <= maxDistanceForRider) {
				for (let j = 0; j < piecelist.length; j++) {
					if (j !== i && piecelist[j] !== 0 && manhattanDistance(coordlist[i]!, coordlist[j]!) <= maxDistanceForProtector) {
						return true;
					}
				}
			}
			// single rider that matters is not protected or too far away
			return false;
		}
	}
	return false;
}

// calculate a list of interesting squares to move to for a white piece with a certain piece index
function get_white_piece_candidate_squares(piece_index: number, piecelist: number[], coordlist: Coords[]): Coords[] {
	const candidate_squares: Coords[] = [];

	const piece_type = piecelist[piece_index]!;

	// piece no longer exists
	if (piece_type === 0) return candidate_squares;

	const piece_properties = pieceTypeDictionary[piece_type]!;
	const piece_square = coordlist[piece_index]!;

	if (ignorepawnmoves && piece_properties.is_pawn) return candidate_squares;
	if (ignoreroyalmoves && piece_properties.is_royal) return candidate_squares;

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
		// if no jump move has been added and piece has no ride moves or is a huygens, add single best jump move as candidate
		if (candidate_squares.length === 0 && best_target_square! !== undefined && ( !piece_properties.rides || piece_properties.is_huygen )) candidate_squares.push(best_target_square!);
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
				const c1_min = Math.ceil(c1 - wiggleroomDictionary[piece_type]!);
				const c1_max = Math.floor(c1 + wiggleroomDictionary[piece_type]!);
				const c2_min = Math.ceil(c2 - wiggleroomDictionary[piece_type]!);
				const c2_max = Math.floor(c2 + wiggleroomDictionary[piece_type]!);

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

		// if piece is huygens, discard all nonprime candidate squares or squares already covered by jump moves
		const is_huygen = (pieceTypeDictionary[piecelist[piece_index]!]!.is_huygen ? true : false);
		if (is_huygen) {
			const distance = manhattanDistance(piece_square, target_square);
			if (!isprime.primalityTest(distance, null)) continue candidates_loop;
		}

		const square_near_king_1 = add_move(target_square, rescaleVector(c2_min, v2));
		const square_near_king_2 = add_move(target_square, rescaleVector(c2_max, v2));

		// ensure that piece threatens target square
		if (!rider_threatens(v1, piece_square, target_square, is_huygen, piecelist, coordlist, {exclude_white_piece_squares: true})) continue;

		// ensure that target square threatens square near black king
		if (!rider_threatens(v2, target_square, square_near_king_1, false, piecelist, coordlist, {threatening_own_square: true}) &&
			!rider_threatens(v2, target_square, square_near_king_2, false, piecelist, coordlist, {threatening_own_square: true})
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
				else if (rider_threatens(v2, target_square, candidate_squares[i]!, is_huygen, piecelist, coordlist, {ignore_blockers: true})) continue candidates_loop;

				// replace accepted candidate square with current candidate square if they lie on the same line as, but new square is nearer
				else if (rider_threatens(v2, candidate_squares[i]!, target_square, is_huygen, piecelist, coordlist, {ignore_blockers: true})) {
					candidate_squares[i] = target_square;
					continue candidates_loop;
				}
			}
			candidate_squares.push(target_square);
		}
	}
}

// calculate a list of interesting moves for the white pieces in the position given by piecelist&coordlist
// if inProtectedRiderFleeMode, then moves by pieces with type riderTypeToFleeFrom are not considered
function get_white_candidate_moves(inProtectedRiderFleeMode: boolean, piecelist: number[], coordlist: Coords[]): Coords[][] {
	const candidate_moves: Coords[][] = [];
	for (let piece_index = 0; piece_index < piecelist.length; piece_index++) {
		if (inProtectedRiderFleeMode && riderTypeToFleeFrom === piecelist[piece_index]) candidate_moves.push([]);
		else candidate_moves.push(get_white_piece_candidate_squares(piece_index, piecelist, coordlist));
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
 * @param {Boolean} inTrapFleeMode - whether black is in trap flee mode -> leads to lower scores, if true
 * @param {Boolean} inProtectedRiderFleeMode - whether black is in protected rider flee mode -> leads to higher scores, if true
 * @returns {Number}
 */
function get_position_evaluation(piecelist: number[], coordlist: Coords[], black_to_move: boolean, inTrapFleeMode: boolean, inProtectedRiderFleeMode: boolean): number {
	let score = 0;

	// add penalty based on number of legal moves of black royal
	const incheck = is_check(piecelist, coordlist);
	score += legalMoveEvalDictionary[incheck ? 0 : 1]![get_black_legal_move_amount(false, piecelist, coordlist)]!;

	// do not give stalemate Infinity reward if white to move or black in trap flee mode
	if (score === Infinity && (!black_to_move || inTrapFleeMode)) score = 1.5 * legalMoveEvalDictionary[0]![1]!;

	const black_to_move_num = black_to_move ? 0 : 1;
	for (let i = 0; i < piecelist.length; i++) {
		// add penalty based on existence of white pieces
		score += pieceExistenceEvalDictionary[piecelist[i]!]!;

		// add score based on distance of black royal to white shortrange pieces
		if (piecelist[i]! in distancesEvalDictionary) {
			const [weight, distancefunction] = distancesEvalDictionary[piecelist[i]!]![black_to_move_num]!;
			if (inProtectedRiderFleeMode && riderTypeToFleeFrom === piecelist[i]) score += 50 * weight * distancefunction(coordlist[i]!);
			else score += weight * distancefunction(coordlist[i]!);
		}
	}

	// add score based on distance of black royal to center of mass of white pieces near black king
	if (checkmateSelectedID in centerOfMassEvalDictionary) {
		const [piecetype, cutoff, weight, distancefunction] = centerOfMassEvalDictionary[checkmateSelectedID]![black_to_move_num]!;
		const center_of_mass = get_center_of_mass(piecetype, cutoff, start_piecelist, start_coordlist);
		if (center_of_mass) score += weight * distancefunction(center_of_mass);
	}
	
	return score;
}

/**
 * Performs a standard search with alpha-beta pruning through the game tree and updates globallyBestVariation and the like
 * @param {Array} piecelist 
 * @param {Array} coordlist 
 * @param {Number} depth 
 * @param {Number} start_depth - does not get changed at all during recursion
 * @param {Boolean} black_to_move 
 * @param {Boolean} followingPrincipal - whether the function is still following the (initial) principal variation
 * @param {Boolean} inTrapFleeMode - whether one should neglect all white candidate moves in deeper search
 * @param {Boolean} inProtectedRiderFleeMode - whether one should neglect all white candidate moves by rider in deeper search and reward distance from him
 * @param {Coords[]} black_killer_list - list of black killer moves that is being maintained when white to move
 * @param {Number[]} white_killer_list - list white killer pieces that is being maintained when black to move
 * @param {Number} alpha 
 * @param {Number} beta 
 * @param {Number} alphaPlies - alpha beta for remaining plies in the game: tiebreak in case of early game over: the more plies the game lasts the better for black
 * @param {Number} betaPlies
 * @returns {Object} with properties "score", "move" and "termination_depth"
 */
function alphabeta(piecelist: number[], coordlist: Coords[], depth: number, start_depth: number, black_to_move: boolean, followingPrincipal: boolean, inTrapFleeMode: boolean, inProtectedRiderFleeMode: boolean, black_killer_list: Coords[], white_killer_list: Number[], alpha: number, beta: number, alphaPlies: number, betaPlies: number): { score: number, bestVariation: { [key: number]: [number, Coords] }, survivalPlies: number, black_killer_move?: Coords, white_killer_piece_index?: Number, terminate_now: boolean } {
	enginePositionCounter++;
	// Empirically: The bot needs roughly 40ms to check 3000 positions, so check every 40ms if enough time has passed to terminate computation
	if (enginePositionCounter % 3000 === 0 && Date.now() - engineStartTime >= engineTimeLimitPerMoveMillis ) {
		return {score: NaN, bestVariation: {}, survivalPlies: NaN, terminate_now: true};
	// If game over, return position evaluation
	} else if ( black_to_move && get_black_legal_move_amount(false, piecelist, coordlist) === 0) {
		return {score: get_position_evaluation(piecelist, coordlist, black_to_move, inTrapFleeMode, inProtectedRiderFleeMode), bestVariation: {}, survivalPlies: start_depth - depth, terminate_now: false };
	// At max depth, return position evaluation
	} else if (depth === 0) {
		return {score: get_position_evaluation(piecelist, coordlist, black_to_move, inTrapFleeMode, inProtectedRiderFleeMode), bestVariation: {}, survivalPlies: start_depth + 1, terminate_now: false };
	}

	let bestVariation: { [key: number]: [number, Coords] } = {};
	
	// Black to move
	if (black_to_move) {
		let maxScore = -Infinity;
		let maxPlies = -Infinity;
		let black_killer_move: Coords | undefined = undefined;
		let black_moves = get_black_legal_moves(inTrapFleeMode, piecelist, coordlist);

		// Black is in trap flee mode and considers no white candidate moves no piece captures from here on out:
		if (mayEnterTrapFleeMode && depth === start_depth && isBlackInTrap(piecelist, coordlist)) inTrapFleeMode = true;

		// Black is in protected rider flee mode and considers no white rider candidate moves no piece captures from here on out:
		if (mayEnterProtectedRiderFleeMode && depth === start_depth && isBlackNearProtectedRider(piecelist, coordlist)) inProtectedRiderFleeMode = true;

		// Order black moves by immediate evaluation function
		if (depth > 1 && black_moves.length > 1) {
			const black_move_evals: number[] = [];
			for (const move of black_moves) {
				const [order_piecelist, order_coordlist] = make_black_move(move, piecelist, coordlist);
				const order_score = get_position_evaluation(order_piecelist, order_coordlist, false, inTrapFleeMode, inProtectedRiderFleeMode);
				black_move_evals.push(order_score);
			}

			// Get sorted indices
			const order_indices = black_move_evals.map((_, i) => i).sort((a, b) => black_move_evals[b]! - black_move_evals[a]!);

			// Reorder black_moves arrays based on sorted indices
			black_moves = order_indices.map(i => black_moves[i]!);
		}

		// Use killer move heuristic, i.e. put moves in black_killer_list in front
		if (black_killer_list.length > 0) {
			const reordered_moves_killers: Coords[] = [];
			const reordered_moves_nonkillers: Coords[] = [];
			for (const move of black_moves) {
				if (tuplelist_contains_tuple(black_killer_list, move)) reordered_moves_killers.push(move); // Add killer moves to the first list
				else reordered_moves_nonkillers.push(move); // Add non-killer moves to second list
			}
			black_moves.length = 0;
			black_moves.push(...reordered_moves_killers, ...reordered_moves_nonkillers);
		}

		// If we are still in followingPrincipal mode, do principal variation ordering
		if (followingPrincipal && globallyBestVariation[start_depth - depth]) {
			for (let index = 0; index < black_moves.length; index++) {
				if (squares_are_equal(black_moves[index]!, globallyBestVariation[start_depth - depth]![1]!)) {
					// Shuffe principal move to the front of black_moves
					const optimal_move = black_moves.splice(index, 1)[0]!;
					black_moves.unshift(optimal_move);
					break;
				}
			}
		} else {
			// We are too deep now, principal variation no longer applies
			followingPrincipal = false;
		}

		// loop over all possible black moves, do alpha beta pruning with (alpha, beta) (and (alphaPlies, betaPlies) as the tiebreaker)
		blackMoveLoop: for (const move of black_moves) {
			const [new_piecelist, new_coordlist] = make_black_move(move, piecelist, coordlist);
			const evaluation = alphabeta(new_piecelist, new_coordlist, depth - 1, start_depth, false, followingPrincipal, inTrapFleeMode, inProtectedRiderFleeMode, [], white_killer_list, alpha, beta, alphaPlies, betaPlies);
			if (evaluation.terminate_now) return {score: NaN, bestVariation: {}, survivalPlies: NaN, terminate_now: true};
			followingPrincipal = false;

			// append white killer piece to running white_killer_list, if it caused a beta cutoff
			if (evaluation.white_killer_piece_index) white_killer_list.push(evaluation.white_killer_piece_index);

			const new_score = evaluation.score;
			const survivalPlies = evaluation.survivalPlies;
			if (new_score >= maxScore) {
				if (new_score > maxScore || survivalPlies > maxPlies || (survivalPlies === maxPlies && rand() < 0.5) || Object.keys(bestVariation).length === 0) {
					bestVariation = evaluation.bestVariation;
					bestVariation[start_depth - depth] = [NaN, move];
					maxScore = new_score;
					maxPlies = survivalPlies;
					alpha = Math.max(alpha, new_score);
					alphaPlies = Math.max(alphaPlies, survivalPlies);
					if (depth === start_depth && new_score >= globallyBestScore && survivalPlies >= globalSurvivalPlies) {
						globallyBestVariation = bestVariation;
						globallyBestScore = new_score;
						globalSurvivalPlies = survivalPlies;
					}
				}
			}
			if ((beta < alpha) || (beta === alpha && betaPlies < alphaPlies)) {
				black_killer_move = move;
				break blackMoveLoop;
			}
		}
		return { score: maxScore, bestVariation: bestVariation, survivalPlies: maxPlies, black_killer_move: black_killer_move, terminate_now: false };

	// White to move
	} else {
		let minScore = Infinity;
		let minPlies = Infinity;
		let white_killer_piece_index: Number | undefined = undefined;
		let candidate_moves: Coords[][];

		if (inTrapFleeMode) candidate_moves = [[coordlist[0]], ...Array(piecelist.length - 1).fill([])];
		else candidate_moves = get_white_candidate_moves(inProtectedRiderFleeMode, piecelist, coordlist);

		// go through pieces for in increasing order of what piece has how many candidate moves
		const indices = [...Array(piecelist.length).keys()];
		indices.sort((a, b) => { return candidate_moves[a]!.length - candidate_moves[b]!.length; });

		// Use killer move heuristic, i.e. put pieces in white_killer_list in front
		if (white_killer_list.length > 0) {
			const reordered_indices_killers: number[] = [];
			const reordered_indices_nonkillers: number[] = [];
			for (const piece_index of indices) {
				if (piece_index in white_killer_list) reordered_indices_killers.push(piece_index); // Add killer moves to the first list
				else reordered_indices_nonkillers.push(piece_index); // Add non-killer moves to second list
			}
			indices.length = 0;
			indices.push(...reordered_indices_killers, ...reordered_indices_nonkillers);
		}

		// If we are still in followingPrincipal mode, do principal variation ordering
		if (followingPrincipal && globallyBestVariation[start_depth - depth]) {
			for (let p_index = 0; p_index < indices.length; p_index++) {
				if (indices[p_index] === globallyBestVariation[start_depth - depth]![0]!) {
					// Shuffe principal piece index to the front of indices
					const optimal_index = indices.splice(p_index, 1)[0]!;
					indices.unshift(optimal_index);
					// Loop over candidate moves for principal piece
					for (let m_index = 0; m_index < candidate_moves[optimal_index]!.length; m_index++) {
						if (squares_are_equal(candidate_moves[optimal_index]![m_index]!, globallyBestVariation[start_depth - depth]![1]!)) {
							// Shuffe principal move to the front of candidate_moves for that piece
							const optimal_move = candidate_moves[optimal_index]!.splice(m_index, 1)[0]!;
							candidate_moves[optimal_index]!.unshift(optimal_move);
							break;
						}
					}
					break;
				}
			}
		} else {
			// We are too deep now, principal variation no longer applies
			followingPrincipal = false;
		}

		// loop over all possible white moves, do alpha beta pruning with (alpha, beta) (and (alphaPlies, betaPlies) as the tiebreaker)
		whiteMoveLoop: for (const piece_index of indices) {
			for (const target_square of candidate_moves[piece_index]!) {
				const [new_piecelist, new_coordlist] = make_white_move(piece_index, target_square, piecelist, coordlist);
				const evaluation = alphabeta(new_piecelist, new_coordlist, depth - 1, start_depth, true, followingPrincipal, inTrapFleeMode, inProtectedRiderFleeMode, black_killer_list, [], alpha, beta, alphaPlies, betaPlies);
				if (evaluation.terminate_now) return {score: NaN, bestVariation: {}, survivalPlies: NaN, terminate_now: true};
				followingPrincipal = false;

				// append black killer move to running black_killer_list, if it caused a beta cutoff
				if (evaluation.black_killer_move) black_killer_list.push(evaluation.black_killer_move);

				const new_score = evaluation.score;
				const survivalPlies = evaluation.survivalPlies;
				if (new_score <= minScore) {
					if (new_score < minScore || survivalPlies < minPlies || (survivalPlies === minPlies && rand() < 0.5) || Object.keys(bestVariation).length === 0) {
						bestVariation = evaluation.bestVariation;
						bestVariation[start_depth - depth] = [piece_index, target_square];
						minScore = new_score;
						minPlies = survivalPlies;
						beta = Math.min(beta, new_score);
						betaPlies = Math.min(betaPlies, survivalPlies);
					}
				}
				if ((beta < alpha) || (beta === alpha && betaPlies < alphaPlies)) {
					white_killer_piece_index = piece_index;
					break whiteMoveLoop;
				}
			}
		}
		return { score: minScore, bestVariation: bestVariation, survivalPlies: minPlies, white_killer_piece_index: white_killer_piece_index, terminate_now: false };
	}
}

/**
 * Performs a search with alpha-beta pruning through the game tree with iteratively greater depths
 */
function runIterativeDeepening(piecelist: number[], coordlist: Coords[], maxdepth: number): void {
	// immediately initialize and set globallyBestVariation randomly, in case nothing better ever gets found
	const black_moves = get_black_legal_moves(false, piecelist, coordlist);
	globallyBestVariation[0] = [NaN, black_moves[Math.floor(rand() * black_moves.length)]! ];
	const [dummy_piecelist, dummy_coordlist] = make_black_move(globallyBestVariation[0]![1]!, piecelist, coordlist);
	globallyBestScore = get_position_evaluation(dummy_piecelist, dummy_coordlist, false, false, false);
	globalSurvivalPlies = 1;

	try {
		// iteratively deeper and deeper search
		for (let depth = 1; depth <= maxdepth; depth = depth + 2) {
			const evaluation = alphabeta(piecelist, coordlist, depth, depth, true, true, false, false, [], [], -Infinity, Infinity, 0, Infinity);
			if (evaluation.terminate_now) { 
				// console.log("Search interrupted at depth " + depth);
				break;
			}
			globallyBestVariation = evaluation.bestVariation;
			globallyBestScore = evaluation.score;
			globalSurvivalPlies = evaluation.survivalPlies;
			// console.log(`Depth ${depth}, Plies To Mate: ${globalSurvivalPlies}, Best score: ${globallyBestScore}, Best move by Black: ${globallyBestVariation[0]![1]!}.`);

			// early exit conditions
			if (depth === 1) {
				const black_move = globallyBestVariation[0]![1]!;
				const [new_piecelist, new_coordlist] = make_black_move(black_move, piecelist, coordlist);

				// If a piece is captured, immediately check for insuffmat
				// We do this by constructing the piecesOrganizedByKey property of a dummy gamefile
				// This works as long insufficientmaterial.js only cares about piecesOrganizedByKey
				if (new_piecelist.filter(x => x === 0).length > piecelist.filter(x => x === 0).length) {
					const piecesOrganizedByKey: { [key: string]: string } = {};
					piecesOrganizedByKey["0,0"] = (royal_type === "k" ? "kingsB" : "royalCentaursB");
					for (let i = 0; i < piecelist.length; i++) {
						if (new_piecelist[i] !== 0) {
							piecesOrganizedByKey[new_coordlist[i]!.toString()] = invertedPieceNameDictionaty[new_piecelist[i]!]!;
						}
					}
					const dummy_gamefile = { 
						piecesOrganizedByKey: piecesOrganizedByKey,
						ourPieces: {},
						moves: [],
						gameRules: input_gamefile.gameRules
					} as unknown as gamefile;
					if (insufficientmaterial.detectInsufficientMaterial(dummy_gamefile)) break;
				}

				// special case for 3B3B-1k variant after piece capture
				// enforce parity constraint to never get checkmated: the king will always move to the square color with fewer bishops unless making a capture
				if (checkmateSelectedID === "3B3B-1k" && piecelist.length < 6) {
					const parity = (coordlist.filter(([a, b]) => (a + b) % 2 === 0).length < 3 ? 0 : 1);
					const optimal_move = black_moves.find(([a, b]) => Math.abs((a + b) % 2) === parity);
					if (optimal_move !== undefined) {
						globallyBestVariation[0] = [NaN, optimal_move];
						break;
					};
				}
			}
		}
	}
	catch (error) {
		// If engine suggests illegal move for black, choose it randomly, else abort with currently best move
		if (!tuplelist_contains_tuple(black_moves, globallyBestVariation[0]![1]!)) globallyBestVariation[0] = [NaN, black_moves[Math.floor(rand() * black_moves.length)]! ];
		console.error("Something went wrong with the iterative deepening calculation, aborting early...");
		console.error(error);
	}
}

/**
 * Given some string, returns an array of four random seeds
 * Source: https://stackoverflow.com/questions/521295/seeding-the-random-number-generator-in-javascript
 */
function cyrb128(str: string) {
	let h1 = 1779033703, h2 = 3144134277,
		h3 = 1013904242, h4 = 2773480762;
	for (let i = 0, k; i < str.length; i++) {
		k = str.charCodeAt(i);
		h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
		h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
		h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
		h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
	}
	h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
	h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
	h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
	h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
	h1 ^= (h2 ^ h3 ^ h4), h2 ^= h1, h3 ^= h1, h4 ^= h1;
	return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

/**
 * Given some number, returns a seeded function that draws uniformly random numbers between 0 and 1
 * Source: https://stackoverflow.com/questions/521295/seeding-the-random-number-generator-in-javascript
 */
function mulberry32(a: number) {
	return function() {
	  let t = a += 0x6D2B79F5;
	  t = Math.imul(t ^ t >>> 15, t | 1);
	  t ^= t + Math.imul(t ^ t >>> 7, t | 61);
	  return ((t ^ t >>> 14) >>> 0) / 4294967296;
	};
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
async function runEngine() {
	try {
		// get real coordinates and parse type of black royal piece
		if ((input_gamefile.ourPieces.kingsB?.length ?? 0) !== 0) {
			gamefile_royal_coords = input_gamefile.ourPieces.kingsB[0]!;
			royal_moves = king_moves;
			royal_type = "k";
		} else if ((input_gamefile.ourPieces.royalCentaursB?.length ?? 0) !== 0) {
			gamefile_royal_coords = input_gamefile.ourPieces.royalCentaursB[0]!;
			royal_moves = centaur_moves;
			royal_type = "rc";
		} else {
			return console.error("No black king or royal centaur found in game");
		}

		// create list of types and coords of white pieces, in order to initialize start_piecelist and start_coordlist
		start_piecelist = [];
		start_coordlist = [];
		for (const key in input_gamefile.piecesOrganizedByKey) {
			const pieceType = input_gamefile.piecesOrganizedByKey[key]!;
			if (pieceType.slice(-1) !== "W") continue; // ignore nonwhite pieces
			const coords = key.split(',').map(Number);
			start_piecelist.push(pieceNameDictionary[pieceType]!);
			// shift all white pieces, so that the black royal is at [0,0]
			start_coordlist.push([coords[0]! - gamefile_royal_coords[0]!, coords[1]! - gamefile_royal_coords[1]!]);
		}

		// reorder white piecelist and coordlist so that RNG is always initialized in the same way
		const sort_indices = start_coordlist
			.map((coord, index) => ({coord: coord, index: index})) // Store index and coord in an object
			.sort((a, b) => { // Sort chosen objects by the stored coords
				const normA = manhattanNorm(a.coord);
				const normB = manhattanNorm(b.coord);
				if (normA !== normB) return normA - normB;
				else if (a.coord[1] !== b.coord[1]) return a.coord[1] - b.coord[1];
				else return a.coord[0] - b.coord[0];
			})
			.map(object => object.index); // Extract the new order of indices
		start_piecelist = sort_indices.map(i => start_piecelist[i]!); // Reorder start_piecelist based on sort_indices
		start_coordlist = sort_indices.map(i => start_coordlist[i]!); // Reorder start_coordlist based on sort_indices

		// Initialize seeded RNG function based on starting position
		const seedString = `${start_piecelist.toString()}|${start_coordlist.toString()}`;
		const seedArray = cyrb128(seedString);
		rand = mulberry32(seedArray[0]!);

		// run iteratively deepened move search
		runIterativeDeepening(start_piecelist, start_coordlist, Infinity);

		// console.log(isBlackInTrap(start_piecelist, start_coordlist));
		// console.log(get_white_candidate_moves(start_piecelist, start_coordlist));
		// console.log(globalSurvivalPlies);
		// console.log(globallyBestVariation);
		// console.log(enginePositionCounter);

		// submit engine move after enough time has passed
		const time_now = Date.now();
		if (time_now - engineStartTime < engineTimeLimitPerMoveMillis) {
			await new Promise(r => setTimeout(r, engineTimeLimitPerMoveMillis - (time_now - engineStartTime)));
		}
		postMessage(move_to_gamefile_move(globallyBestVariation[0]![1]!));

	} catch (e) {
		console.error("An error occured in the engine computation of the checkmate practice");
		console.error(e);
	}
}
