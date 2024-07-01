
/*
 * This script contains the movesets for all pieces except specials (pawns, castling)
 */

'use strict';

const movesets = (function() {

    /**
     * Returns the movesets of all the pieces, modified according to the specified slideLimit gamerule.
     * 
     * These movesets are called as functions so that they return brand
     * new copies of each moveset so there's no risk of accidentally modifying the originals.
     * @param {number} slideLimit - Optional. The slideLimit gamerule value.
     * @returns {Object} Object containing the movesets of all pieces except pawns.
     */
    function getPieceMovesets(slideLimit = Infinity) {
        if (typeof slideLimit !== 'number') throw new Error("slideLimit gamerule is in an unsupported value.")

        return {
            // Finitely moving
            pawns: function () {
                return { individual: [] }
            },
            knights: function () {
                return {
                    individual: [
                        [-2,1],[-1,2],[1,2],[2,1],
                        [-2,-1],[-1,-2],[1,-2],[2,-1]
                    ]
                }
            },
            hawks: function () {
                return {
                    individual: [
                        [-3,0],[-2,0],[2,0],[3,0],
                        [0,-3],[0,-2],[0,2],[0,3],
                        [-2,-2],[-2,2],[2,-2],[2,2],
                        [-3,-3],[-3,3],[3,-3],[3,3]
                    ]
                }
            },
            kings: function () {
                return {
                    individual: [
                        [-1,0],[-1,1],[0,1],[1,1],
                        [1,0],[1,-1],[0,-1],[-1,-1]
                    ]
                }
            },
            guards: function () {
                return {
                    individual: [
                        [-1,0],[-1,1],[0,1],[1,1],
                        [1,0],[1,-1],[0,-1],[-1,-1]
                    ]
                }
            },
            // Infinitely moving
            rooks: function () {
                return {
                    individual: [],
                    horizontal: [-slideLimit, slideLimit],
                    vertical: [-slideLimit, slideLimit]
                }
            },
            bishops: function () {
                return {
                    individual: [],
                    diagonalUp: [-slideLimit, slideLimit], // These represent the x limit of the piece sliding diagonally
                    diagonalDown: [-slideLimit, slideLimit]
                }
            },
            queens: function () {
                return {
                    individual: [],
                    horizontal: [-slideLimit, slideLimit],
                    vertical: [-slideLimit, slideLimit],
                    diagonalUp: [-slideLimit, slideLimit], // These represent the x limit of the piece sliding diagonally
                    diagonalDown: [-slideLimit, slideLimit]
                }
            },
            royalQueens: function () {
                return {
                    individual: [],
                    horizontal: [-slideLimit, slideLimit],
                    vertical: [-slideLimit, slideLimit],
                    diagonalUp: [-slideLimit, slideLimit], // These represent the x limit of the piece sliding diagonally
                    diagonalDown: [-slideLimit, slideLimit]
                }
            },
            chancellors: function () {
                return {
                    individual: [
                        [-2,1],[-1,2],[1,2],[2,1],
                        [-2,-1],[-1,-2],[1,-2],[2,-1]
                    ],
                    horizontal: [-slideLimit, slideLimit],
                    vertical: [-slideLimit, slideLimit]
                }
            },
            archbishops: function () {
                return {
                    individual: [
                        [-2,1],[-1,2],[1,2],[2,1],
                        [-2,-1],[-1,-2],[1,-2],[2,-1]
                    ],
                    diagonalUp: [-slideLimit, slideLimit],
                    diagonalDown: [-slideLimit, slideLimit]
                }
            },
            amazons: function () {
                return {
                    individual: [
                        [-2,1],[-1,2],[1,2],[2,1],
                        [-2,-1],[-1,-2],[1,-2],[2,-1]
                    ],
                    horizontal: [-slideLimit, slideLimit],
                    vertical: [-slideLimit, slideLimit],
                    diagonalUp: [-slideLimit, slideLimit], // These represent the x limit of the piece sliding diagonally
                    diagonalDown: [-slideLimit, slideLimit]
                }
            },
            camels: function () {
                return {
                    individual: [
                        [-3,1],[-1,3],[1,3],[3,1],
                        [-3,-1],[-1,-3],[1,-3],[3,-1]
                    ]
                }
            },
            giraffes: function () {
                return {
                    individual: [
                        [-4,1],[-1,4],[1,4],[4,1],
                        [-4,-1],[-1,-4],[1,-4],[4,-1]
                    ]
                }
            },
            zebras: function () {
                return {
                    individual: [
                        [-3,2],[-2,3],[2,3],[3,2],
                        [-3,-2],[-2,-3],[2,-3],[3,-2]
                    ]
                }
            },
            centaurs: function () {
                return {
                    individual: [
                        // Guard moveset
                        [-1,0],[-1,1],[0,1],[1,1],
                        [1,0],[1,-1],[0,-1],[-1,-1],
                        // + Knight moveset!
                        [-2,1],[-1,2],[1,2],[2,1],
                        [-2,-1],[-1,-2],[1,-2],[2,-1]
                    ]
                }
            },
            royalCentaurs: function () {
                return {
                    individual: [
                        // Guard moveset
                        [-1,0],[-1,1],[0,1],[1,1],
                        [1,0],[1,-1],[0,-1],[-1,-1],
                        // + Knight moveset!
                        [-2,1],[-1,2],[1,2],[2,1],
                        [-2,-1],[-1,-2],[1,-2],[2,-1]
                    ]
                }
            },
        }
    }

    return Object.freeze({
        getPieceMovesets
    })

})();