
/**
 * This script contains the default movesets for all pieces except specials (pawns, castling)
 */

import vectors from '../../util/math/vectors.js';
import { rawTypes } from '../util/typeutil.js';
import specialdetect from './specialdetect.js';
import legalmoves from './legalmoves.js';
// @ts-ignore
import isprime from '../../util/isprime.js';

// Type definitions...

import type { Coords } from '../util/coordutil.js';
import type { CoordsSpecial } from './movepiece.js';
import type { RawTypeGroup, Player, RawType } from '../util/typeutil.js';
import type { Piece } from '../util/boardutil.js';
import type { FullGame } from './gamefile.js';
import type { Vec2, Vec2Key } from '../../util/math/vectors.js';


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
	 * `"1,0": [null,null]` => Lets the piece slide horizontally infinitely in both directions.
	 * 
	 * The *key* is the step amount of each skip, and the *value* is the skip limit in the -x and +x directions (-y and +y if it's vertical).
	 * 
	 * THE X-KEY SHOULD NEVER BE NEGATIVE!!!
	 */
	sliding?: SlidingMoves,
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
 * Sliding moves the piece can make.
 * 
 * `"1,0": [-5,null]` => Lets the piece slide 5 squares in the negative vector direction, or infinitely in the positive.
 * 
 * The *key* is the step amount of each skip, and the *value* is the skip limit in the -x and +x directions (-y and +y if it's vertical).
 * 
 * THE 0-INDEX KEY SHOULD ALWAYS BE NEGATIVE!!!
 */
type SlidingMoves = {
	[slideDirection: Vec2Key]: [bigint | null, bigint | null]
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
 * 1 => Blocked ON the square (enemy piece)
 * 2 => Blocked 1 before the square (friendly piece or void)
 * 
 * The return value of 0 will be useful in the future for allowing pieces
 * to *phase* through other pieces.
 * An example of this would be the "witch", which makes all adjacent friendly
 * pieces "transparent", allowing friendly pieces to phase through them.
 */
// eslint-disable-next-line no-unused-vars
type BlockingFunction = (friendlyColor: Player, blockingPiece: Piece, coords: Coords, premove: boolean) => 0 | 1 | 2;
/**
 * A function that returns an array of any legal special individual moves for the piece,
 * each of the coords will have a special property attached to it. castle/promote/enpassant
 */
// eslint-disable-next-line no-unused-vars
type SpecialFunction = (gamefile: FullGame, coords: Coords, color: Player, premove: boolean) => CoordsSpecial[]



/** The default blocking function of each piece's sliding moves, if not specified. */
function defaultBlockingFunction(friendlyColor: Player, blockingPiece: Piece, coords: Coords, premove: boolean): 0 | 1 | 2 {
	return legalmoves.testCaptureValidity(friendlyColor, blockingPiece.type, premove);
}

/** The default ignore function of each piece's sliding moves, if not specified. */
function defaultIgnoreFunction(): boolean {
	return true; // Square allowed
}

/**
 * Generates all orthogonal/diagonal moves on the perimeter of a square with a given radius (king, hawk).
 */
function generateCompassMoves(distance: bigint): Coords[] {
	return [
		[-distance, distance], [0n, distance], [distance, distance],
		[-distance, 0n], /*[0n,0n],*/ [distance, 0n],
		[-distance, -distance], [0n, -distance], [distance, -distance]
	];
}

/**
 * Generates the 8 moves for an (m,n) leaper piece (knight, camel, zebra, giraffe).
 * It creates all permutations of (±m, ±n) and (±n, ±m).
 */
function generateLeaperMoves(m: bigint, n: bigint): Coords[] {
	return [
		// Positive second coordinate ("up" on a board)
		[-n, m], [-m, n], [m, n], [n, m],
		// Negative second coordinate ("down" on a board)
		[-n, -m], [-m, -n], [m, -n], [n, -m],
	];
}

/**
 * Returns the movesets of all the pieces, modified according to the specified slideLimit gamerule.
 * 
 * These movesets are called as functions so that they return brand
 * new copies of each moveset so there's no risk of accidentally modifying the originals.
 * @param [slideLimit] Optional. The slideLimit gamerule value.
 * @returns Object containing the movesets of all pieces except pawns.
 */
function getPieceDefaultMovesets(slideLimit: bigint | null = null): Movesets {
	if (typeof slideLimit !== 'bigint' && slideLimit !== null) throw new Error("slideLimit gamerule is in an unsupported value.");

	// Slide limits of all pieces. Negative the first index.
	const slideLimits: [bigint | null, bigint | null] = [slideLimit === null ? null : -slideLimit, slideLimit];

	// Define common movesets to reduce duplication
	const kingMoves: Coords[] = generateCompassMoves(1n);
	const knightMoves = generateLeaperMoves(1n, 2n);
	const rookMoves: SlidingMoves = {
		'1,0': slideLimits,
		'0,1': slideLimits
	};
	const bishopMoves: SlidingMoves = {
		'1,1': slideLimits,
		'1,-1': slideLimits
	};


	return {
		// Finitely moving
		[rawTypes.PAWN]: {
			special: specialdetect.pawns
		},
		[rawTypes.KNIGHT]: {
			individual: knightMoves
		},
		[rawTypes.HAWK]: {
			individual: [
                ...generateCompassMoves(2n),
				...generateCompassMoves(3n),
            ]
		},
		[rawTypes.KING]: {
			individual: kingMoves,
			special: specialdetect.kings
		},
		[rawTypes.GUARD]: {
			individual: kingMoves
		},
		// Infinitely moving
		[rawTypes.ROOK]: {
			sliding: rookMoves
		},
		[rawTypes.BISHOP]: {
			sliding: bishopMoves
		},
		[rawTypes.QUEEN]: {
			sliding: {
				...rookMoves,
				...bishopMoves
			}
		},
		[rawTypes.ROYALQUEEN]: {
			sliding: {
				...rookMoves,
				...bishopMoves
			}
		},
		[rawTypes.CHANCELLOR]: {
			individual: knightMoves,
			sliding: rookMoves
		},
		[rawTypes.ARCHBISHOP]: {
			individual: knightMoves,
			sliding: bishopMoves
		},
		[rawTypes.AMAZON]: {
			individual: knightMoves,
			sliding: {
				...rookMoves,
				...bishopMoves
			}
		},
		[rawTypes.CAMEL]: {
			individual: generateLeaperMoves(1n, 3n)
		},
		[rawTypes.GIRAFFE]: {
			individual: generateLeaperMoves(1n, 4n)
		},
		[rawTypes.ZEBRA]: {
			individual: generateLeaperMoves(2n, 3n)
		},
		[rawTypes.KNIGHTRIDER]: {
			sliding: {
				'1,2': slideLimits,
				'1,-2': slideLimits,
				'2,1': slideLimits,
				'2,-1': slideLimits,
			}
		},
		[rawTypes.CENTAUR]: {
			individual: [
                ...kingMoves,
                ...knightMoves
            ]
		},
		[rawTypes.ROYALCENTAUR]: {
			individual: [
				...kingMoves,
                ...knightMoves
            ],
			special: specialdetect.kings
		},
		[rawTypes.HUYGEN]: {
			sliding: rookMoves,
			blocking: (friendlyColor: Player, blockingPiece: Piece, coords: Coords, premove: boolean): 0 | 1 | 2 => {
				const distance = vectors.chebyshevDistance(coords, blockingPiece.coords);
				const isPrime = isprime.primalityTest(distance);
				if (!isPrime) return 0; // Doesn't block, not even if it's a void. It hops over it!
				return legalmoves.testCaptureValidity(friendlyColor, blockingPiece.type, premove);
			},
			ignore: (startCoords: Coords, endCoords: Coords): boolean => {
				const distance = vectors.chebyshevDistance(startCoords, endCoords);
				const isPrime = isprime.primalityTest(distance);
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
	return Array.from(slides, vectors.getVec2FromKey);
}



export default {
	defaultBlockingFunction,
	defaultIgnoreFunction,
	getPieceDefaultMovesets,
	getPossibleSlides,
};

export type {
	Movesets,
	PieceMoveset,
	BlockingFunction,
	IgnoreFunction,
	SpecialFunction
};