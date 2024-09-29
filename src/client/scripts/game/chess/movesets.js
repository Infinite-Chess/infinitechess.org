
'use strict';

/**
 * This script contains the movesets for all pieces except specials (pawns, castling)
 * 
 * ZERO dependancies
 */

const types = ['kings', 'giraffes', 'camels', 'zebras', 'knightriders', 'amazons', 'queens', 'royalQueens', 'hawks', 'chancellors', 'archbishops', 'centaurs', 'royalCentaurs', 'knights', 'guards', 'rooks', 'bishops', 'pawns'];
/** All neutral types the game is compatible with. */
const neutralTypes = ['voids', 'obstacles'];
const alltypes = [...neutralTypes, ...types];

function blankset() {return {};}

/**
 * Returns the movesets of all the pieces, modified according to the specified slideLimit gamerule.
 * 
 * These movesets are called as functions so that they return brand
 * new copies of each moveset so there's no risk of accidentally modifying the originals.
 * @param {number} slideLimit - Optional. The slideLimit gamerule value.
 * @returns {Object} Object containing the movesets of all pieces except pawns.
 */
function getPieceMovesets(slideLimit = Infinity) {
    if (typeof slideLimit !== 'number') throw new Error("slideLimit gamerule is in an unsupported value.");

    const movesets = {
        voids: blankset,
        obstacles: blankset,
        // Finitely moving
        pawns: blankset,
        knights: function() {
            return {
                individual: [
                    [-2,1],[-1,2],[1,2],[2,1],
                    [-2,-1],[-1,-2],[1,-2],[2,-1]
                ]
            };
        },
        hawks: function() {
            return {
                individual: [
                    [-3,0],[-2,0],[2,0],[3,0],
                    [0,-3],[0,-2],[0,2],[0,3],
                    [-2,-2],[-2,2],[2,-2],[2,2],
                    [-3,-3],[-3,3],[3,-3],[3,3]
                ]
            };
        },
        kings: function() {
            return {
                individual: [
                    [-1,0],[-1,1],[0,1],[1,1],
                    [1,0],[1,-1],[0,-1],[-1,-1]
                ]
            };
        },
        guards: function() {
            return {
                individual: [
                    [-1,0],[-1,1],[0,1],[1,1],
                    [1,0],[1,-1],[0,-1],[-1,-1]
                ]
            };
        },
        // Infinitely moving
        rooks: function() {
            return {
                individual: [],
                sliding: {
                    '1,0': [-slideLimit, slideLimit],
                    '0,1': [-slideLimit, slideLimit]
                }
            };
        },
        bishops: function() {
            return {
                individual: [],
                sliding: {
                    '1,1': [-slideLimit, slideLimit], // These represent the x limit of the piece sliding diagonally
                    '1,-1': [-slideLimit, slideLimit]
                }
            };
        },
        queens: function() {
            return {
                individual: [],
                sliding: {
                    '1,0': [-slideLimit, slideLimit],
                    '0,1': [-slideLimit, slideLimit],
                    '1,1': [-slideLimit, slideLimit], // These represent the x limit of the piece sliding diagonally
                    '1,-1': [-slideLimit, slideLimit]
                }
            };
        },
        royalQueens: function() {
            return {
                individual: [],
                sliding: {
                    '1,0': [-slideLimit, slideLimit],
                    '0,1': [-slideLimit, slideLimit],
                    '1,1': [-slideLimit, slideLimit], // These represent the x limit of the piece sliding diagonally
                    '1,-1': [-slideLimit, slideLimit]
                }
            };
        },
        chancellors: function() {
            return {
                individual: [
                    [-2,1],[-1,2],[1,2],[2,1],
                    [-2,-1],[-1,-2],[1,-2],[2,-1]
                ],
                sliding: {
                    '1,0': [-slideLimit, slideLimit],
                    '0,1': [-slideLimit, slideLimit]
                }            
            };
        },
        archbishops: function() {
            return {
                individual: [
                    [-2,1],[-1,2],[1,2],[2,1],
                    [-2,-1],[-1,-2],[1,-2],[2,-1]
                ],
                sliding: {
                    '1,1': [-slideLimit, slideLimit],
                    '1,-1': [-slideLimit, slideLimit]
                }
            };
        },
        amazons: function() {
            return {
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
            };
        },
        camels: function() {
            return {
                individual: [
                    [-3,1],[-1,3],[1,3],[3,1],
                    [-3,-1],[-1,-3],[1,-3],[3,-1]
                ]
            };
        },
        giraffes: function() {
            return {
                individual: [
                    [-4,1],[-1,4],[1,4],[4,1],
                    [-4,-1],[-1,-4],[1,-4],[4,-1]
                ]
            };
        },
        zebras: function() {
            return {
                individual: [
                    [-3,2],[-2,3],[2,3],[3,2],
                    [-3,-2],[-2,-3],[2,-3],[3,-2]
                ]
            };
        },
        knightriders: function() {
            return {
                individual: [],
                sliding: {
                    '1,2' : [-slideLimit, slideLimit],
                    '1,-2' : [-slideLimit,slideLimit],
                    '2,1' : [-slideLimit,slideLimit],
                    '2,-1' : [-slideLimit,slideLimit],
                }
            };
        },
        centaurs: function() {
            return {
                individual: [
                    // Guard moveset
                    [-1,0],[-1,1],[0,1],[1,1],
                    [1,0],[1,-1],[0,-1],[-1,-1],
                    // + Knight moveset!
                    [-2,1],[-1,2],[1,2],[2,1],
                    [-2,-1],[-1,-2],[1,-2],[2,-1]
                ]
            };
        },
        royalCentaurs: function() {
            return {
                individual: [
                    // Guard moveset
                    [-1,0],[-1,1],[0,1],[1,1],
                    [1,0],[1,-1],[0,-1],[-1,-1],
                    // + Knight moveset!
                    [-2,1],[-1,2],[1,2],[2,1],
                    [-2,-1],[-1,-2],[1,-2],[2,-1]
                ]
            };
        },
    };
    
    return alltypes.map(type => movesets[type]);
}

export default {
    getPieceMovesets
};