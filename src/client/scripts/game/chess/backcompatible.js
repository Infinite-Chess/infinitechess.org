
/**
 * Converts pre-1.3 old gamefile code into the new internal format.
 */

'use script';

const backcompatible = (function() {

    /**
     * Makes sure the gamefile/longformat is in the new notation.
     * @param {Object} longformat - The format converter long format output, or an old gamefile.
     * @returns {Object} The gamefile in the latest notation.
     */
    function getLongformatInNewNotation(longformat) {
        if (!isLongformatInOldNotation(longformat)) return longformat; // Already in new notation

        // Convert old to new notation...

        // An example of an old gamefile:
        // {"variant":"Classical","promotionRanks":[1,8],"moves":[[{"type":"pawnsW","startCoords":[4,2],"endCoords":[4,4]},{"type":"pawnsB","startCoords":[4,7],"endCoords":[4,5]}],[{"type":"pawnsW","startCoords":[3,2],"endCoords":[3,3]},{"type":"knightsB","startCoords":[7,8],"endCoords":[6,6]}],[{"type":"knightsW","startCoords":[7,1],"endCoords":[6,3]},{"type":"bishopsB","startCoords":[3,8],"endCoords":[85,-74]}],[{"type":"bishopsW","startCoords":[6,1],"endCoords":[-4496198,-4496203]},{"type":"bishopsB","startCoords":[85,-74],"endCoords":[82,-77]}],[{"type":"bishopsW","startCoords":[3,1],"endCoords":[9,7]},{"type":"bishopsB","startCoords":[82,-77],"endCoords":[4,1],"captured":"queensW"}],[{"type":"kingsW","startCoords":[5,1],"endCoords":[4,1],"captured":"bishopsB"},{"type":"rooksB","startCoords":[8,8],"endCoords":[611,8]}],[{"type":"pawnsW","startCoords":[1,2],"endCoords":[1,4]},{"type":"queensB","startCoords":[4,8],"endCoords":[4,7]}],[{"type":"rooksW","startCoords":[8,1],"endCoords":[57,1]},{"type":"queensB","startCoords":[4,7],"endCoords":[9,2]}],[{"type":"bishopsW","startCoords":[9,7],"endCoords":[5,3]},{"type":"queensB","startCoords":[9,2],"endCoords":[9,-998535]}],[{"type":"rooksW","startCoords":[1,1],"endCoords":[-11009,1]},{"type":"queensB","startCoords":[9,-998535],"endCoords":[4,-998535]}],[{"type":"knightsW","startCoords":[2,1],"endCoords":[4,0]}]]}
        const converted = {};
        
        /** What properties do we need in the new format?
         * metadata
         * turn
         * enpassant
         * moveRule
         * fullMove
         * startingPosition
         * specialRights
         * moves
         * gameRules
         */

        const { pawnDoublePush, castleWith } = longformat.gameRules ? longformat.gameRules : {};

        converted.metadata = {};
        if (longformat.variant) converted.metadata.Variant = longformat.variant;
        converted.turn = 'white';
        converted.fullMove = 1;
        if (longformat.startingPosition) {
            converted.startingPosition = longformat.startingPosition;
            converted.specialRights = formatconverter.generateSpecialRights(longformat.startingPosition, pawnDoublePush, castleWith)
        }
        if (longformat.moves?.length > 0) {
            // If it's a black-moves-first game, then the `turn` property of the results will be set to black.
            const results = {};
            const moveslong = movesscript.convertMovesTo1DFormat(longformat.moves, results) // Long format still, needs to be compressed
            converted.turn = results.turn;

            const options = {
                next_move: converted.turn === 'white' ? 'w' : 'b',
                fullmove: converted.fullMove,
                make_new_lines: false,
                compact_moves: 2
            }
            const shortmoves = formatconverter.longToShortMoves(moveslong, options)
            const shortmovessplit = shortmoves.split('|')
            
            converted.moves = shortmovessplit
        }
        if (longformat.promotionRanks) {
            if (!longformat.gameRules) longformat.gameRules = { promotionRanks: longformat.promotionRanks }
            else longformat.gameRules.promotionRanks = longformat.promotionRanks;
        }
        if (longformat.promotionColumns) {
            if (!longformat.gameRules) longformat.gameRules = { promotionRanks: longformat.promotionColumns }
            else longformat.gameRules.promotionColumns = longformat.promotionColumns;
        }
        if (longformat.gameRules) {
            // Example of old gameRules format:
            // {
            //     slideLimit: "Infinity",
            //     castleWith: "rooks",
            //     pawnDoublePush: true,
            //     winConditions: { 
            //       checkmate: 'both',
            //       // royalcapture: 'both',
            //       // allroyalscaptured: 'both',
            //       // allpiecescaptured: 'both',
            //       // threecheck: 'both',
            //       // koth: 'both'
            //     }
            // }
            const newGameRules = {}
            if (longformat.gameRules.slideLimit && longformat.gameRules.slideLimit !== "Infinity") newGameRules.slideLimit = longformat.gameRules.slideLimit;
            if (longformat.gameRules.winConditions) {
                const newWinConditions = { white: [], black: [] }
                for (const condition in longformat.gameRules.winConditions) {
                    const value = longformat.gameRules.winConditions[condition];
                    if (value === 'both' || value === 'white') newWinConditions.white.push(condition);
                    if (value === 'both' || value === 'black') newWinConditions.black.push(condition);
                }
                newGameRules.winConditions = newWinConditions;
            }
            if (longformat.promotionRanks) {
                newGameRules.promotionRanks = [longformat.promotionRanks[1], longformat.promotionRanks[0]];
                // The old gamefiles did not specify promotions allowed, because it's determined by the pieces the game starts with
                newGameRules.promotionsAllowed = variant.getPromotionsAllowed(longformat.startingPosition, newGameRules.promotionRanks)
            }
            if (longformat.promotionColumns) {
                newGameRules.promotionColumns = [longformat.promotionColumns[1], longformat.promotionColumns[0]];
                // The old gamefiles did not specify promotions allowed, because it's determined by the pieces the game starts with
                newGameRules.promotionsAllowed = newGameRules.promotionsAllowed || variant.getPromotionsAllowed(longformat.startingPosition, newGameRules.promotionColumns)
            }
            converted.gameRules = newGameRules;
        }

        console.log("longformat after converting to new format:")
        console.log(math.deepCopyObject(converted))

        return converted;
    }

    function isLongformatInOldNotation(longformat) {
        // An example of an old gamefile:
        // {"variant":"Classical","promotionRanks":[1,8],"moves":[[{"type":"pawnsW","startCoords":[4,2],"endCoords":[4,4]},{"type":"pawnsB","startCoords":[4,7],"endCoords":[4,5]}],[{"type":"pawnsW","startCoords":[3,2],"endCoords":[3,3]},{"type":"knightsB","startCoords":[7,8],"endCoords":[6,6]}],[{"type":"knightsW","startCoords":[7,1],"endCoords":[6,3]},{"type":"bishopsB","startCoords":[3,8],"endCoords":[85,-74]}],[{"type":"bishopsW","startCoords":[6,1],"endCoords":[-4496198,-4496203]},{"type":"bishopsB","startCoords":[85,-74],"endCoords":[82,-77]}],[{"type":"bishopsW","startCoords":[3,1],"endCoords":[9,7]},{"type":"bishopsB","startCoords":[82,-77],"endCoords":[4,1],"captured":"queensW"}],[{"type":"kingsW","startCoords":[5,1],"endCoords":[4,1],"captured":"bishopsB"},{"type":"rooksB","startCoords":[8,8],"endCoords":[611,8]}],[{"type":"pawnsW","startCoords":[1,2],"endCoords":[1,4]},{"type":"queensB","startCoords":[4,8],"endCoords":[4,7]}],[{"type":"rooksW","startCoords":[8,1],"endCoords":[57,1]},{"type":"queensB","startCoords":[4,7],"endCoords":[9,2]}],[{"type":"bishopsW","startCoords":[9,7],"endCoords":[5,3]},{"type":"queensB","startCoords":[9,2],"endCoords":[9,-998535]}],[{"type":"rooksW","startCoords":[1,1],"endCoords":[-11009,1]},{"type":"queensB","startCoords":[9,-998535],"endCoords":[4,-998535]}],[{"type":"knightsW","startCoords":[2,1],"endCoords":[4,0]}]]}
        return longformat.variant || longformat.promotionRanks || longformat.promotionColumns || longformat.moves && movesscript.areMovesIn2DFormat(longformat.moves)
    }

    return Object.freeze({
        getLongformatInNewNotation
    }) 

})();