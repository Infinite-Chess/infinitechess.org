
'use strict';

/**
 * This script contains the default movesets for all pieces except specials (pawns, castling)
 * 
 * ZERO dependancies
 */

// Type definitions...

// @ts-ignore
import type { gamefile } from './gamefile.js';
// @ts-ignore
import type { Piece } from './movepiece.js';

/**
 * A Movesets object containing the movesets for every piece type in a game
 */
interface Movesets {
	[pieceType: string]: PieceMoveset
};

// TODO: move this to coordutil.js after that is converted to typescript.
type Coords = [number, number];

/**
 * This runs once for every square you can slide to that's visible on the screen.
 * It returns true if the square is legal to move to, false otherwise.
 */
// eslint-disable-next-line no-unused-vars
type IgnoreFunction = (startCoords: Coords, endCoords: Coords, gamefile?: gamefile, detectCheck?: (gamefile: gamefile, color: string, attackers: {
	coords: Coords,
	slidingCheck: boolean
}) => boolean) => boolean;


/**
 * This runs once for every piece on the same line of the selected piece.
 * 
 * 0 => Piece doesn't block
 * 1 => Blocked (friendly piece)
 * 2 => Blocked 1 square after (enemy piece)
 */
// eslint-disable-next-line no-unused-vars
type BlockingFunction = (blockingPiece: Piece, gamefile?: gamefile) => number;

/**
 * A moveset for an single piece type in a game
 */
interface PieceMoveset {
    individual: Coords[],
	sliding?: {
		[slideDirection: string]: Coords
	},
	ignore?: IgnoreFunction,
	blocking?: BlockingFunction
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
		pawns: {
			individual: []
		},
		knights: {
			individual: [
                [-2,1],[-1,2],[1,2],[2,1],
                [-2,-1],[-1,-2],[1,-2],[2,-1]
            ]
		},
		hawks: {
			individual: [
                [-3,0],[-2,0],[2,0],[3,0],
                [0,-3],[0,-2],[0,2],[0,3],
                [-2,-2],[-2,2],[2,-2],[2,2],
                [-3,-3],[-3,3],[3,-3],[3,3]
            ]
		},
		kings: {
			individual: [
                [-1,0],[-1,1],[0,1],[1,1],
                [1,0],[1,-1],[0,-1],[-1,-1]
            ]
		},
		guards: {
			individual: [
                [-1,0],[-1,1],[0,1],[1,1],
                [1,0],[1,-1],[0,-1],[-1,-1]
            ]
		},
		// Infinitely moving
		rooks: {
			individual: [],
			sliding: {
				'1,0': [-slideLimit, slideLimit],
				'0,1': [-slideLimit, slideLimit]
			}
		},
		bishops: {
			individual: [],
			sliding: {
				'1,1': [-slideLimit, slideLimit], // These represent the x limit of the piece sliding diagonally
				'1,-1': [-slideLimit, slideLimit]
			}
		},
		queens: {
			individual: [],
			sliding: {
				'1,0': [-slideLimit, slideLimit],
				'0,1': [-slideLimit, slideLimit],
				'1,1': [-slideLimit, slideLimit], // These represent the x limit of the piece sliding diagonally
				'1,-1': [-slideLimit, slideLimit]
			}
		},
		royalQueens: {
			individual: [],
			sliding: {
				'1,0': [-slideLimit, slideLimit],
				'0,1': [-slideLimit, slideLimit],
				'1,1': [-slideLimit, slideLimit], // These represent the x limit of the piece sliding diagonally
				'1,-1': [-slideLimit, slideLimit]
			}
		},
		chancellors: {
			individual: [
                [-2,1],[-1,2],[1,2],[2,1],
                [-2,-1],[-1,-2],[1,-2],[2,-1]
            ],
			sliding: {
				'1,0': [-slideLimit, slideLimit],
				'0,1': [-slideLimit, slideLimit]
			}
		},
		archbishops: {
			individual: [
                [-2,1],[-1,2],[1,2],[2,1],
                [-2,-1],[-1,-2],[1,-2],[2,-1]
            ],
			sliding: {
				'1,1': [-slideLimit, slideLimit],
				'1,-1': [-slideLimit, slideLimit]
			}
		},
		amazons: {
			individual: [
                [-2,1],[-1,2],[1,2],[2,1],
                [-2,-1],[-1,-2],[1,-2],[2,-1]
            ],
			sliding: {
				'1,0': [-slideLimit, slideLimit],
				'0,1': [-slideLimit, slideLimit],
				'1,1': [-slideLimit, slideLimit], // These represent the x limit of the piece sliding diagonally
				'1,-1': [-slideLimit, slideLimit]
			}
		},
		camels: {
			individual: [
                [-3,1],[-1,3],[1,3],[3,1],
                [-3,-1],[-1,-3],[1,-3],[3,-1]
            ]
		},
		giraffes: {
			individual: [
                [-4,1],[-1,4],[1,4],[4,1],
                [-4,-1],[-1,-4],[1,-4],[4,-1]
            ]
		},
		zebras: {
			individual: [
                [-3,2],[-2,3],[2,3],[3,2],
                [-3,-2],[-2,-3],[2,-3],[3,-2]
            ]
		},
		knightriders: {
			individual: [],
			sliding: {
				'1,2' : [-slideLimit, slideLimit],
				'1,-2' : [-slideLimit,slideLimit],
				'2,1' : [-slideLimit,slideLimit],
				'2,-1' : [-slideLimit,slideLimit],
			}
		},
		centaurs: {
			individual: [
                // Guard moveset
                [-1,0],[-1,1],[0,1],[1,1],
                [1,0],[1,-1],[0,-1],[-1,-1],
                // + Knight moveset!
                [-2,1],[-1,2],[1,2],[2,1],
                [-2,-1],[-1,-2],[1,-2],[2,-1]
            ]
		},
		royalCentaurs: {
			individual: [
                // Guard moveset
                [-1,0],[-1,1],[0,1],[1,1],
                [1,0],[1,-1],[0,-1],[-1,-1],
                // + Knight moveset!
                [-2,1],[-1,2],[1,2],[2,1],
                [-2,-1],[-1,-2],[1,-2],[2,-1]
            ]
		},
		roses: {
			individual: []
		}
	};
}



export default {
	getPieceDefaultMovesets,
};

export type { Movesets, PieceMoveset, Coords, IgnoreFunction, BlockingFunction };