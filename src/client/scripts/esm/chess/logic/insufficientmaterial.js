
/**
 * This script detects draws by insufficient material
 * 
 * @maintainer tsevasa
 */

// Import Start
import moveutil from '../util/moveutil.js';
import typeutil from '../util/typeutil.js';
import boardutil from '../util/boardutil.js';
import gamerules from '../variants/gamerules.js';
import { rawTypes as r, ext as e, players } from '../util/typeutil.js';
// Import End

/** 
 * Type Definitions 
 * @typedef {import('./gamefile.js').gamefile} gamefile
 */

"use strict";

// Lists of scenarios that lead to a draw by insufficient material
// Entries for bishops are given by tuples ordered in descending order, because of parity
// so that bishops on different colored squares are treated seperately

// Checkmate one black king with one white king for help
// The pieces {'kingsB': 1, 'kingsW': 1} are assumed for each entry of this list
const insuffmatScenarios_1K1k = [
    {[r.QUEEN + e.W]: 1},
    {[r.BISHOP + e.W]: [Infinity, 1]},
    {[r.KNIGHT + e.W]: 3},
    {[r.HAWK + e.W]: 2},
	{[r.HAWK + e.W]: 1, [r.BISHOP + e.W]: [1, 0]},
    {[r.ROOK + e.W]: 1, [r.KNIGHT + e.W]: 1},
    {[r.ROOK + e.W]: 1, [r.BISHOP + e.W]: [1, 0]},
    {[r.ROOK + e.W]: 1, [r.ROOK + e.B]: 1},
    {[r.ARCHBISHOP + e.W]: 1, [r.BISHOP + e.W]: [1, 0]},
    {[r.ARCHBISHOP + e.W]: 1, [r.KNIGHT + e.W]: 1},
    {[r.KNIGHT + e.W]: 1, [r.BISHOP + e.W]: [Infinity, 0]},
    {[r.KNIGHT + e.W]: 1, [r.BISHOP + e.W]: [1, 1]},
    {[r.KNIGHT + e.W]: 2, [r.BISHOP + e.W]: [1, 0]},
    {[r.GUARD + e.W]: 1},
    {[r.CHANCELLOR + e.W]: 1},
    {[r.KNIGHTRIDER + e.W]: 2},
    {[r.PAWN + e.W]: 3}
];

// Checkmate one black king without any white kings
// The piece {[r.KING + e.B]: 1} is assumed for each entry of this list
const insuffmatScenarios_0K1k = [
    {[r.QUEEN + e.W]: 1, [r.ROOK + e.W]: 1},
    {[r.QUEEN + e.W]: 1, [r.KNIGHT + e.W]: 1},
    {[r.QUEEN + e.W]: 1, [r.BISHOP + e.W]: [1, 0]},
    {[r.QUEEN + e.W]: 1, [r.PAWN + e.W]: 1},
    {[r.BISHOP + e.W]: [2, 2]},
    {[r.BISHOP + e.W]: [Infinity, 1]},
    {[r.KNIGHT + e.W]: 4},
    {[r.KNIGHT + e.W]: 2, [r.BISHOP + e.W]: [Infinity, 0]},
    {[r.KNIGHT + e.W]: 2, [r.BISHOP + e.W]: [1, 1]},
    {[r.KNIGHT + e.W]: 1, [r.BISHOP + e.W]: [2, 1]},
    {[r.HAWK + e.W]: 3},
    {[r.ROOK + e.W]: 1, [r.KNIGHT + e.W]: 1, [r.BISHOP + e.W]: [1, 0]},
    {[r.ROOK + e.W]: 1, [r.KNIGHT + e.W]: 1, [r.PAWN + e.W]: 1},
    {[r.ROOK + e.W]: 1, [r.KNIGHT + e.W]: 2},
    {[r.ROOK + e.W]: 1, [r.GUARD + e.W]: 1},
    {[r.ROOK + e.W]: 2, [r.BISHOP + e.W]: [1, 0]},
    {[r.ROOK + e.W]: 2, [r.KNIGHT + e.W]: 1},
    {[r.ROOK + e.W]: 2, [r.PAWN + e.W]: 1},
    {[r.ARCHBISHOP + e.W]: 1, [r.BISHOP + e.W]: [2, 0]},
    {[r.ARCHBISHOP + e.W]: 1, [r.BISHOP + e.W]: [1, 1]},
    {[r.ARCHBISHOP + e.W]: 1, [r.KNIGHT + e.W]: 2},
    {[r.ARCHBISHOP + e.W]: 2},
    {[r.CHANCELLOR + e.W]: 1, [r.GUARD + e.W]: 1},
    {[r.CHANCELLOR + e.W]: 1, [r.KNIGHT + e.W]: 1},
    {[r.CHANCELLOR + e.W]: 1, [r.ROOK + e.W]: 1},
    {[r.GUARD + e.W]: 2},
    {[r.AMAZON + e.W]: 1},
    {[r.KNIGHTRIDER + e.W]: 3},
    {[r.PAWN + e.W]: 6},
	{[r.HUYGEN + e.W]: 4}
];

// other special insuffmat scenarios
const insuffmatScenarios_special = [
    {[r.KING + e.B]: Infinity, [r.KING + e.W]: Infinity},
    {[r.ROYALCENTAUR + e.B]: Infinity, [r.ROYALCENTAUR + e.W]: Infinity},
    {[r.ROYALCENTAUR + e.B]: 1, [r.AMAZON + e.W]: 1}
];

/**
 * Detects if the provided piecelist scenario is a draw by insufficient material
 * @param {Object} scenario - scenario of piececounts in the game, e.g. {'kingsB': 1, 'kingsW': 1, 'queensW': 3}
 * @returns {boolean} *true*, if the scenario is a draw by insufficient material, otherwise *false*
 */
function isScenarioInsuffMat(scenario) {
	// find out if we are in the 1 king vs 1 king, or in the 0 kings vs 1 king situation, and set scenrariosForInsuffMat accordingly
	let scenrariosForInsuffMat;
	if (scenario[r.KING + e.B] === 1) {
		if (scenario[r.KING + e.W] === 1) {
			scenrariosForInsuffMat = insuffmatScenarios_1K1k;
			delete scenario[r.KING + e.W];
			delete scenario[r.KING + e.B];
		} else if (!scenario[r.KING + e.W]) {
			scenrariosForInsuffMat = insuffmatScenarios_0K1k;
			delete scenario[r.KING + e.B];
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
	return tuple[0] + tuple[1];
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
 * @returns {string | false} '0 insuffmat', if the game is over by the insufficient material, otherwise *false*.
 */
function detectInsufficientMaterial(gamefile) {
	// Only make the draw check if the win condition is checkmate for both players
	if (!gamerules.doesColorHaveWinCondition(gamefile.gameRules, players.WHITE, 'checkmate') || !gamerules.doesColorHaveWinCondition(gamefile.gameRules, players.BLACK, 'checkmate')) return false;
	if (gamerules.getWinConditionCountOfColor(gamefile.gameRules, players.WHITE) !== 1 || gamerules.getWinConditionCountOfColor(gamefile.gameRules, players.BLACK) !== 1) return false;

	// Only make the draw check if the last move was a capture or promotion or if there is no last move
	const lastMove = moveutil.getLastMove(gamefile.moves);
	if (lastMove && ! (lastMove.flags.capture || lastMove.promotion)) return false;

	// Only make the draw check if there are less than 11 non-obstacle pieces
	if (boardutil.getPieceCountOfGame(gamefile.ourPieces, { ignoreTypes: [r.OBSTACLE] }) >= 11) return false;

	// Create scenario object listing amount of all non-obstacle pieces in the game
	const scenario = {};
	// bishops are treated specially and separated by parity
	const bishopsW_count = [0, 0];
	const bishopsB_count = [0, 0];
	for (const idx of gamefile.ourPieces.coords.values()) {
		const piece = boardutil.getPieceFromIdx(gamefile.ourPieces, idx);
		const [raw, color] = typeutil.splitType(piece.type);
		if (raw === r.OBSTACLE) continue;
		
		else if (raw === r.BISHOP) {
			const parity = Math.abs(sum_tuple_coords(piece.coords)) % 2;
			if (color === players.WHITE) bishopsW_count[parity] += 1;
			else if (color === players.BLACK) bishopsB_count[parity] += 1;
		}
		else if (piece.type in scenario) scenario[piece.type] += 1;
		else scenario[piece.type] = 1;
	}

	// add bishop tuples to scenario, and make sure the first entry of the bishop lists is the largest one
	if (sum_tuple_coords(bishopsW_count) !== 0) scenario[r.BISHOP + e.W] = ordered_tuple_descending(bishopsW_count);
	if (sum_tuple_coords(bishopsB_count) !== 0) scenario[r.BISHOP + e.B] = ordered_tuple_descending(bishopsB_count);

	// Temporary: Short-circuit insuffmat check if a player has a pawn that he can promote
	// This is fully enough for the checkmate practice mode, for now
	// Future TODO: Create new scenarios for each possible promotion combination and check them all as well
	if (gamefile.gameRules.promotionRanks) {
		const promotionListWhite = gamefile.gameRules.promotionsAllowed[players.WHITE];
		const promotionListBlack = gamefile.gameRules.promotionsAllowed[players.BLACK];
		if ((r.PAWN + e.W) in scenario && promotionListWhite.length !== 0) return false;
		if ((r.PAWN + e.B) in scenario && promotionListBlack.length !== 0) return false;
	}

	// Create scenario object with inverted players
	const invertedScenario = {};
	for (const piece in scenario) {
		const pieceInverted = typeutil.invertType(piece);
		invertedScenario[pieceInverted] = scenario[piece];
	}

	// Make the draw checks by comparing scenario and invertedScenario to scenrariosForInsuffMat
	if (isScenarioInsuffMat(scenario)) return `${players.NEUTRAL} insuffmat`; // Victor of player NEUTRAL means it was a draw.
	else if (isScenarioInsuffMat(invertedScenario)) return `${players.NEUTRAL} insuffmat`; // Victor of player NEUTRAL means it was a draw.
	else return false;
}

export default {
	detectInsufficientMaterial
};