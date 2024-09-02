
// Import Start
import wincondition from './wincondition.js';
import gamefileutility from './gamefileutility.js';
import movesscript from './movesscript.js';
import colorutil from '../misc/colorutil.js';
import coordutil from '../misc/coordutil.js';
// Import End

/** 
 * Type Definitions 
 * @typedef {import('./gamefile.js').gamefile} gamefile
 */

"use strict";

/** This script detects draws by insufficient material. */
const insufficientmaterial = (function() {

    // Lists of scenarios that lead to a draw by insufficient material
    // Entries for bishops are given by tuples ordered in descending order, because of parity
    // so that bishops on different colored squares are treated seperately

    // Checkmate one black king with one white king for help
    // The pieces {'kingsB': 1, 'kingsW': 1} are assumed for each entry of this list
    const insuffmatScenarios_1K1k = [
        {'queensW': 1},
        {'bishopsW': [Infinity, 1]},
        {'knightsW': 3},
        {'hawksW': 2},
        {'rooksW': 1, 'knightsW': 1},
        {'rooksW': 1, 'bishopsW': [1, 0]},
        {'archbishopsW': 1, 'bishopsW': [1, 0]},
        {'archbishopsW': 1, 'knightsW': 1},
        {'knightsW': 1, 'bishopsW': [Infinity, 0]},
        {'knightsW': 1, 'bishopsW': [1, 1]},
        {'knightsW': 2, 'bishopsW': [1, 0]},
        {'guardsW': 1},
        {'chancellorsW': 1},
        {'knightridersW': 2},
        {'pawnsW': 3}
    ];

    // Checkmate one black king without any white kings
    // The piece {'kingsB': 1} is assumed for each entry of this list
    const insuffmatScenarios_0K1k = [
        {'queensW': 1, 'rooksW': 1},
        {'queensW': 1, 'knightsW': 1},
        {'queensW': 1, 'bishopsW': [1, 0]},
        {'queensW': 1, 'pawnsW': 1},
        {'bishopsW': [2, 2]},
        {'bishopsW': [Infinity, 1]},
        {'knightsW': 4},
        {'knightsW': 2, 'bishopsW': [Infinity, 0]},
        {'knightsW': 2, 'bishopsW': [1, 1]},
        {'knightsW': 1, 'bishopsW': [2, 1]},
        {'hawksW': 3},
        {'rooksW': 1, 'knightsW': 1, 'bishopsW': [1, 0]},
        {'rooksW': 1, 'knightsW': 1, 'pawnsW': 1},
        {'rooksW': 1, 'knightsW': 2},
        {'rooksW': 1, 'guardsW': 1},
        {'rooksW': 2, 'bishopsW': [1, 0]},
        {'rooksW': 2, 'knightsW': 1},
        {'rooksW': 2, 'pawnsW': 1},
        {'archbishopsW': 1, 'bishopsW': [2, 0]},
        {'archbishopsW': 1, 'bishopsW': [1, 1]},
        {'archbishopsW': 1, 'knightsW': 2},
        {'archbishopsW': 2},
        {'chancellorsW': 1, 'guardsW': 1},
        {'chancellorsW': 1, 'knightsW': 1},
        {'chancellorsW': 1, 'rooksW': 1},
        {'guardsW': 2},
        {'amazonsW': 1},
        {'knightridersW': 3},
        {'pawnsW': 6}
    ];

    // other special insuffmat scenarios
    const insuffmatScenarios_special = [
        {'kingsB': Infinity, 'kingsW': Infinity},
        {'royalCentaursB': Infinity, 'royalCentaursW': Infinity},
        {'royalCentaursB': 1, 'amazonsW': 1}
    ];

    /**
	 * Detects if the provided piecelist scenario is a draw by insufficient material
	 * @param {Object} scenario - scenario of piececounts in the game, e.g. {'kingsB': 1, 'kingsW': 1, 'queensW': 3}
	 * @returns {boolean} *true*, if the scenario is a draw by insufficient material, otherwise *false*
	 */
    function isScenarioInsuffMat(scenario) {
        // find out if we are in the 1 king vs 1 king, or in the 0 kings vs 1 king situation, and set scenrariosForInsuffMat accordingly
        let scenrariosForInsuffMat;
        if (scenario.kingsB === 1) {
            if (scenario.kingsW === 1) {
                scenrariosForInsuffMat = insuffmatScenarios_1K1k;
                delete scenario.kingsW;
                delete scenario.kingsB;
            } else if (!scenario.kingsW) {
                scenrariosForInsuffMat = insuffmatScenarios_0K1k;
                delete scenario.kingsB;
            } else {
                scenrariosForInsuffMat = insuffmatScenarios_special;
            }
        } else {
            scenrariosForInsuffMat = insuffmatScenarios_special;
        }

        // loop over all applicable draw scenarios to see if they apply here
        drawscenarioloop:
        for (const drawScenario of scenrariosForInsuffMat) {
            for (const piece in scenario) {
                // discard draw scenario if it does not fit the scenario
                if (!(piece in drawScenario) || has_more_pieces(scenario[piece], drawScenario[piece])) continue drawscenarioloop;
            }
            return true;
        }
        return false;
    }

    /**
	 * Checks if a is larger than b, either as a number, or if it has some larger entry as a tuple
	 * @param {number | number[]} a - number or tuple of two numbers
	 * @param {number | number[]} b - number or tuple of two numbers
	 * @returns {boolean}
	 */
    function has_more_pieces(a, b) {
        if (typeof a === "number") return a > b;
        else return a[0] > b[0] || a[1] > b[1];
    }

    /**
	 * @param {number[]} tuple - tuple of two numbers
	 * @returns {number} sum of tuple entries
	 */
    function sum_tuple_coords(tuple) {
        return tuple[0] + tuple [1];
    }

    /**
	 * @param {number[]} tuple - tuple of two numbers
	 * @returns {number[]} tuple ordered in descending order
	 */
    function ordered_tuple_descending(tuple) {
        if (tuple[0] < tuple [1]) return [tuple[1], tuple[0]];
        else return tuple;
    }

    /**
     * Detects if the game is drawn for insufficient material
     * @param {gamefile} gamefile - The gamefile
     * @returns {'draw insuffmat' | false} 'draw insuffmat', if the game is over by the insufficient material, otherwise *false*.
     */
    function detectInsufficientMaterial(gamefile) {
        // Only make the draw check if the win condition is checkmate for both players
        if (!wincondition.doesColorHaveWinCondition(gamefile, 'white', 'checkmate') || !wincondition.doesColorHaveWinCondition(gamefile, 'black', 'checkmate')) return false;
        if (wincondition.getWinConditionCountOfColor(gamefile, 'white') != 1 || wincondition.getWinConditionCountOfColor(gamefile, 'black') != 1) return false;

        // Only make the draw check if the last move was a capture or if there is no last move
        const lastMove = movesscript.getLastMove(gamefile.moves);
        if (lastMove && !lastMove.captured) return false;

        // Only make the draw check if there are less than 11 non-obstacle pieces
        if (gamefileutility.getPieceCountOfGame(gamefile, {ignoreVoids: false, ignoreObstacles: true}) >= 11) return false;

        // Create scenario object listing amount of all non-obstacle pieces in the game
        const scenario = {};
        // bishops are treated specially and separated by parity
        const bishopsW_count = [0, 0];
        const bishopsB_count = [0, 0];
        for (const key in gamefile.piecesOrganizedByKey) {
            const piece = gamefile.piecesOrganizedByKey[key];
            if (piece === "obstaclesN") continue;
            else if (colorutil.trimColorExtensionFromType(piece) === "bishops") {
                const parity = sum_tuple_coords(coordutil.getCoordsFromKey(key)) % 2;
                const color = colorutil.getColorExtensionFromType(piece);
                if (color === "W") bishopsW_count[parity] += 1;
                else if (color === "B") bishopsB_count[parity] += 1;
            }
            else if (piece in scenario) scenario[piece] += 1;
            else scenario[piece] = 1;
        }

        // add bishop tuples to scenario, and make sure the first entry of the bishop lists is the largest one
        if (sum_tuple_coords(bishopsW_count) != 0) scenario.bishopsW = ordered_tuple_descending(bishopsW_count);
        if (sum_tuple_coords(bishopsB_count) != 0) scenario.bishopsB = ordered_tuple_descending(bishopsB_count);

        // Temporary: Short-circuit insuffmat check if a player has a pawn that he can promote
        // This is fully enough for the checkmate practice mode, for now
        // Future TODO: Create new scenarios for each possible promotion combination and check them all as well
        if (gamefile.gameRules.promotionRanks) {
            const promotionListWhite = gamefile.gameRules.promotionsAllowed.white;
            const promotionListBlack = gamefile.gameRules.promotionsAllowed.black;
            if ("pawnsW" in scenario && promotionListWhite.length != 0) return false;
            if ("pawnsB" in scenario && promotionListBlack.length != 0) return false;
        }

        // Create scenario object with inverted colors
        const invertedScenario = {};
        for (const piece in scenario) {
            const pieceInverted = piece.endsWith("W") ? piece.replace(/W$/, "B") : piece.replace(/B$/, "W");
            invertedScenario[pieceInverted] = scenario[piece];
        }

        // Make the draw checks by comparing scenario and invertedScenario to scenrariosForInsuffMat
        if (isScenarioInsuffMat(scenario)) return 'draw insuffmat';
        else if (isScenarioInsuffMat(invertedScenario)) return 'draw insuffmat';
        else return false;
    }

    return Object.freeze({
        detectInsufficientMaterial
    });

})();

export default insufficientmaterial;