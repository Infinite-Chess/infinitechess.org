
/**
 * This script contains the default movesets for all pieces except specials (pawns, castling)
 */

import typeutil from '../util/typeutil.js';
import math from '../../util/math.js';
import { rawTypes } from '../util/typeutil.js';
// @ts-ignore
import specialdetect from './specialdetect.js';
// @ts-ignore
import isprime from '../../util/isprime.js';

// Type definitions...

import type { Coords } from '../util/coordutil.js';
import type { CoordsSpecial } from './movepiece.js';
import type { RawTypeGroup, Player, RawType } from '../util/typeutil.js';
import type { Vec2, Vec2Key } from '../../util/math.js';
import type { Piece } from '../util/boardutil.js';
import type { FullGame } from './gamefile.js';


/**
 * A Movesets object containing the movesets for every piece type in a game
 */
type Movesets = RawTypeGroup<PieceMoveset>

/**
 * A moveset for an single piece type in a game
 */
interface PieceMoveset {
	/**
	 * Jumping moves immediately surrounding the piece where it can move to.
	 * 
	 * TODO: Separate moving-moves from capturing-moves.
	 */
    individual?: Coords[],
	/**
	 * Sliding moves the piece can make.
	 * 
	 * `"1,0": [-Infinity, Infinity]` => Lets the piece slide horizontally infinitely in both directions.
	 * 
	 * The *key* is the step amount of each skip, and the *value* is the skip limit in the -x and +x directions (-y and +y if it's vertical).
	 * 
	 * THE X-KEY SHOULD NEVER BE NEGATIVE!!!
	 */
	sliding?: {
		[slideDirection: Vec2Key]: Coords
	},
	/**
	 * The initial function that determines how far a piece is legally able to slide
	 * according to what pieces block it.
	 * 
	 * This should be provided if we're not using the default.
	 */
	blocking?: BlockingFunction,
	/**
	 * The secondary function that *actually* determines whether each individual
	 * square in a slide is legal to move to.
	 * 
	 * This should be provided if we're not using the default.
	 */
	ignore?: IgnoreFunction,
	/**
	 * If present, the function to call for calculating legal special moves.
	 */
	special?: SpecialFunction
}

/**
 * This runs once for every square you can slide to that's visible on the screen.
 * It returns true if the square is legal to move to, false otherwise.
 * 
 * If no ignore function is specified, the default ignore function that every piece
 * has by default always returns *true*.
 * 
 * The start and end coords arguments are useful for the Huygen, as it can
 * calculate the distance traveled, and then test if it's prime.
 * 
 * The gamefile and detectCheck method may be used for the Royal Queen,
 * as it can test if the squares are check for positive.
 */
// eslint-disable-next-line no-unused-vars
type IgnoreFunction = (startCoords: Coords, endCoords: Coords) => boolean;

/**
 * This runs once for every piece on the same line of the selected piece.
 * 
 * 0 => Piece doesn't block
 * 1 => Blocked (friendly piece)
 * 2 => Blocked 1 square after (enemy piece)
 * 
 * The return value of 0 will be useful in the future for allowing pieces
 * to *phase* through other pieces.
 * An example of this would be the "witch", which makes all adjacent friendly
 * pieces "transparent", allowing friendly pieces to phase through them.
 */
// eslint-disable-next-line no-unused-vars
type BlockingFunction = (friendlyColor: Player, blockingPiece: Piece, coords: Coords) => 0 | 1 | 2;
/**
 * A function that returns an array of any legal special individual moves for the piece,
 * each of the coords will have a special property attached to it. castle/promote/enpassant
 */
// eslint-disable-next-line no-unused-vars
type SpecialFunction = (gamefile: FullGame, coords: Coords, color: Player) => CoordsSpecial[]



/** The default blocking function of each piece's sliding moves, if not specified. */
function defaultBlockingFunction(friendlyColor: Player, blockingPiece: Piece): 0 | 1 | 2 {
	const colorOfBlockingPiece = typeutil.getColorFromType(blockingPiece.type);
	const isVoid = typeutil.getRawType(blockingPiece.type) === rawTypes.VOID;
	if (friendlyColor === colorOfBlockingPiece || isVoid) return 1; // Block where it is if it is a friendly OR a void square.
	else return 2; // Allow the capture if enemy, but block afterward
}

/** The default ignore function of each piece's sliding moves, if not specified. */
function defaultIgnoreFunction() {
	return true; // Square allowed
}

/**
 * Returns the movesets of all the pieces, modified according to the specified slideLimit gamerule.
 * 
 * These movesets are called as functions so that they return brand
 * new copies of each moveset so there's no risk of accidentally modifying the originals.
 * @param [slideLimit] Optional. The slideLimit gamerule value.
 * @returns Object containing the movesets of all pieces except pawns.
 */
function getPieceDefaultMovesets(slideLimit: number = Infinity): Movesets {
	if (typeof slideLimit !== 'number') throw new Error("slideLimit gamerule is in an unsupported value.");

	return {
		// Finitely moving
		[rawTypes.PAWN]: {
			special: specialdetect.pawns
		},
		[rawTypes.KNIGHT]: {
			individual: [
                [-2,1],[-1,2],[1,2],[2,1],
                [-2,-1],[-1,-2],[1,-2],[2,-1]
            ]
		},
		[rawTypes.HAWK]: {
			individual: [
                [-3,0],[-2,0],[2,0],[3,0],
                [0,-3],[0,-2],[0,2],[0,3],
                [-2,-2],[-2,2],[2,-2],[2,2],
                [-3,-3],[-3,3],[3,-3],[3,3]
            ]
		},
		[rawTypes.KING]: {
			individual: [
                [-1,0],[-1,1],[0,1],[1,1],
                [1,0],[1,-1],[0,-1],[-1,-1]
            ],
			special: specialdetect.kings
		},
		[rawTypes.GUARD]: {
			individual: [
                [-1,0],[-1,1],[0,1],[1,1],
                [1,0],[1,-1],[0,-1],[-1,-1]
            ]
		},
		// Infinitely moving
		[rawTypes.ROOK]: {
			sliding: {
				'1,0': [-slideLimit, slideLimit],
				'0,1': [-slideLimit, slideLimit]
			}
		},
		[rawTypes.BISHOP]: {
			sliding: {
				'1,1': [-slideLimit, slideLimit],
				'1,-1': [-slideLimit, slideLimit]
			}
		},
		[rawTypes.QUEEN]: {
			sliding: {
				'1,0': [-slideLimit, slideLimit],
				'0,1': [-slideLimit, slideLimit],
				'1,1': [-slideLimit, slideLimit],
				'1,-1': [-slideLimit, slideLimit]
			}
		},
		[rawTypes.ROYALQUEEN]: {
			sliding: {
				'1,0': [-slideLimit, slideLimit],
				'0,1': [-slideLimit, slideLimit],
				'1,1': [-slideLimit, slideLimit],
				'1,-1': [-slideLimit, slideLimit]
			}
		},
		[rawTypes.CHANCELLOR]: {
			individual: [
                [-2,1],[-1,2],[1,2],[2,1],
                [-2,-1],[-1,-2],[1,-2],[2,-1]
            ],
			sliding: {
				'1,0': [-slideLimit, slideLimit],
				'0,1': [-slideLimit, slideLimit]
			}
		},
		[rawTypes.ARCHBISHOP]: {
			individual: [
                [-2,1],[-1,2],[1,2],[2,1],
                [-2,-1],[-1,-2],[1,-2],[2,-1]
            ],
			sliding: {
				'1,1': [-slideLimit, slideLimit],
				'1,-1': [-slideLimit, slideLimit]
			}
		},
		[rawTypes.AMAZON]: {
			individual: [
                [-2,1],[-1,2],[1,2],[2,1],
                [-2,-1],[-1,-2],[1,-2],[2,-1]
            ],
			sliding: {
				'1,0': [-slideLimit, slideLimit],
				'0,1': [-slideLimit, slideLimit],
				'1,1': [-slideLimit, slideLimit],
				'1,-1': [-slideLimit, slideLimit]
			}
		},
		[rawTypes.CAMEL]: {
			individual: [
                [-3,1],[-1,3],[1,3],[3,1],
                [-3,-1],[-1,-3],[1,-3],[3,-1]
            ]
		},
		[rawTypes.GIRAFFE]: {
			individual: [
                [-4,1],[-1,4],[1,4],[4,1],
                [-4,-1],[-1,-4],[1,-4],[4,-1]
            ]
		},
		[rawTypes.ZEBRA]: {
			individual: [
                [-3,2],[-2,3],[2,3],[3,2],
                [-3,-2],[-2,-3],[2,-3],[3,-2]
            ]
		},
		[rawTypes.KNIGHTRIDER]: {
			sliding: {
				'1,2' : [-slideLimit, slideLimit],
				'1,-2' : [-slideLimit,slideLimit],
				'2,1' : [-slideLimit,slideLimit],
				'2,-1' : [-slideLimit,slideLimit],
			}
		},
		[rawTypes.CENTAUR]: {
			individual: [
                // Guard moveset
                [-1,0],[-1,1],[0,1],[1,1],
                [1,0],[1,-1],[0,-1],[-1,-1],
                // + Knight moveset!
                [-2,1],[-1,2],[1,2],[2,1],
                [-2,-1],[-1,-2],[1,-2],[2,-1]
            ]
		},
		[rawTypes.ROYALCENTAUR]: {
			individual: [
                // Guard moveset
                [-1,0],[-1,1],[0,1],[1,1],
                [1,0],[1,-1],[0,-1],[-1,-1],
                // + Knight moveset!
                [-2,1],[-1,2],[1,2],[2,1],
                [-2,-1],[-1,-2],[1,-2],[2,-1]
            ],
			special: specialdetect.kings
		},
		[rawTypes.HUYGEN]: {
			sliding: {
				'1,0': [-slideLimit, slideLimit],
				'0,1': [-slideLimit, slideLimit]
			},
			blocking: (friendlyColor: Player, blockingPiece: Piece, coords: Coords) => {
				const distance = math.chebyshevDistance(coords, blockingPiece.coords);
				const isPrime = isprime.primalityTest(distance, null);
				if (!isPrime) return 0; // Doesn't block
				const colorOfBlockingPiece = typeutil.getColorFromType(blockingPiece.type);
				if (colorOfBlockingPiece === friendlyColor) return 1; // Friendly piece blocked
				else return 2; // Enemy piece blocked
			},
			ignore: (startCoords: Coords, endCoords: Coords) => {
				const distance = math.chebyshevDistance(startCoords, endCoords);
				const isPrime = isprime.primalityTest(distance, null);
				return isPrime;
			}
		},
		[rawTypes.ROSE]: {
			special: specialdetect.roses
		}
	};
}

/**	
 * Calculates all possible slides that should be possible in the provided game,
 * based on the provided movesets.
 * @param pieceMovesets - MUST BE TRIMMED beforehand to not include movesets of types not present in the game!!!!!
 */
function getPossibleSlides(pieceMovesets: RawTypeGroup<() => PieceMoveset>): Vec2[] {
	const slides = new Set<Vec2Key>(['1,0']); // '1,0' is required if castling is enabled.
	for (const rawtype in pieceMovesets) {
		const moveset = pieceMovesets[Number(rawtype) as RawType]!();
		if (!moveset.sliding) continue;
		Object.keys(moveset.sliding).forEach(slide => slides.add(slide as Vec2Key));
	}
	return Array.from(slides, math.getVec2FromKey);
}



export default {
	defaultBlockingFunction,
	defaultIgnoreFunction,
	getPieceDefaultMovesets,
	getPossibleSlides,
};

export type { Movesets, PieceMoveset, Coords, BlockingFunction, IgnoreFunction, SpecialFunction };