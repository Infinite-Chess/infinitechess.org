
'use strict';

/**
 * This script contains the movesets for all pieces except specials (pawns, castling)
 * 
 * ZERO dependancies
 */

// Type definitions...

import type { gamefile } from './gamefile.js';

/**
 * A Movesets object containing the movesets for every piece type in a game
 */
interface Movesets {
	[key: string]: PieceMoveset
};

/**
 * The return value of the ignore function
 */
interface IgnoreResult {
    legal: boolean,
    blocking: boolean
}

// eslint-disable-next-line no-unused-vars
type IgnoreFunction = (distance: number, gamefile: gamefile, detectCheck: (gamefile: gamefile, color: string, attackers: {
	coords: number[],
	slidingCheck: boolean
}) => boolean) => IgnoreResult;

/**
 * A moveset for an single piece type in a game
 */
interface PieceMoveset {
    individual: number[][],
	sliding?: {
		[key: string]: number[]
	},
	ignore?: IgnoreFunction
}


/**
 * Returns the movesets of all the pieces, modified according to the specified slideLimit gamerule.
 * 
 * These movesets are called as functions so that they return brand
 * new copies of each moveset so there's no risk of accidentally modifying the originals.
 * @param {number} slideLimit Optional. The slideLimit gamerule value.
 * @returns {Movesets} Object containing the movesets of all pieces except pawns.
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

export type {
	Movesets
};