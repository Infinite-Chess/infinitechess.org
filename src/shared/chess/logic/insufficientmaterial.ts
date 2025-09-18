
// src/client/scripts/esm/chess/logic/insufficientmaterial.ts

/**
 * This script detects draws by insufficient material
 * 
 * @maintainer tsevasa
 */


import moveutil from '../util/moveutil.js';
import typeutil from '../util/typeutil.js';
import boardutil from '../util/boardutil.js';
import gamerules from '../variants/gamerules.js';
import { rawTypes as r, ext as e, players, TypeGroup } from '../util/typeutil.js';
import bimath from '../../util/bigdecimal/bimath.js';


import type { GameRules } from '../variants/gamerules.js';
import type { Board } from './gamefile.js';

/** Represents a piece's count, using a tuple for bishops to count them on light and dark squares separately. */
type PieceCount = number | [number, number];
/** Defines an object mapping piece types to their counts, representing a specific collection of pieces on the board. */
type Scenario = TypeGroup<PieceCount>;


// Lists of scenarios that lead to a draw by insufficient material
// Entries for bishops are given by tuples ordered in descending order, because of parity
// so that bishops on different colored squares are treated seperately

// Checkmate one black king with one white king for help
// The pieces {'kingsB': 1, 'kingsW': 1} are assumed for each entry of this list
const insuffmatScenarios_1K1k: Scenario[] = [
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
const insuffmatScenarios_0K1k: Scenario[] = [
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
const insuffmatScenarios_special: Scenario[] = [
    {[r.KING + e.B]: Infinity, [r.KING + e.W]: Infinity},
    {[r.ROYALCENTAUR + e.B]: Infinity, [r.ROYALCENTAUR + e.W]: Infinity},
    {[r.ROYALCENTAUR + e.B]: 1, [r.AMAZON + e.W]: 1}
];

/**
 * Detects if the provided piecelist scenario is a draw by insufficient material
 * @param scenario - scenario of piececounts in the game, e.g. {'kingsB': 1, 'kingsW': 1, 'queensW': 3}
 * @returns *true*, if the scenario is a draw by insufficient material, otherwise *false*
 */
function isScenarioInsuffMat(scenario: Scenario): boolean {
	const scenarioCopy = { ...scenario };
	// find out if we are in the 1 king vs 1 king, or in the 0 kings vs 1 king situation, and set scenrariosForInsuffMat accordingly
	let scenrariosForInsuffMat: Scenario[];
	if (scenarioCopy[r.KING + e.B] === 1) {
		if (scenarioCopy[r.KING + e.W] === 1) {
			scenrariosForInsuffMat = insuffmatScenarios_1K1k;
			delete scenarioCopy[r.KING + e.W];
			delete scenarioCopy[r.KING + e.B];
		} else if (!scenarioCopy[r.KING + e.W]) {
			scenrariosForInsuffMat = insuffmatScenarios_0K1k;
			delete scenarioCopy[r.KING + e.B];
		} else {
			scenrariosForInsuffMat = insuffmatScenarios_special;
		}
	} else {
		scenrariosForInsuffMat = insuffmatScenarios_special;
	}

	// loop over all applicable draw scenarios to see if they apply here
	drawscenarioloop:
	for (const drawScenario of scenrariosForInsuffMat) {
		for (const pieceType in scenarioCopy) {
			// discard draw scenario if it does not fit the scenario
			if (!(pieceType in drawScenario) || has_more_pieces(scenarioCopy[pieceType]!, drawScenario[pieceType]!)) continue drawscenarioloop;
		}
		return true;
	}
	return false;
}

/**
 * Checks if a is larger than b, either as a number, or if it has some larger entry as a tuple
 * @param a - number or tuple of two numbers
 * @param b - number or tuple of two numbers
 */
function has_more_pieces(a: PieceCount, b: PieceCount): boolean {
	if (typeof a === "number") {
		return a > (b as number);
	} else {
		const bArray = b as [number, number];
		return a[0] > bArray[0] || a[1] > bArray[1];
	}
}

/**
 * @param tuple - tuple of two numbers
 * @returns sum of tuple entries
 */
function sum_tuple_coords(tuple: [number,number]): number {
	return tuple[0] + tuple[1];
}

/**
 * @param tuple - tuple of two numbers
 * @returns tuple ordered in descending order
 */
function ordered_tuple_descending(tuple: [number, number]): [number, number] {
	if (tuple[0] < tuple [1]) return [tuple[1], tuple[0]];
	else return tuple;
}

/**
 * Detects if the game is drawn for insufficient material
 * @param gameRules
 * @param boardsim
 * @returns '0 insuffmat', if the game is over by the insufficient material, otherwise *undefined*.
 */
function detectInsufficientMaterial(gameRules: GameRules, boardsim: Board): string | undefined {
	// Only make the draw check if the win condition is checkmate for both players
	if (!gamerules.doesColorHaveWinCondition(gameRules, players.WHITE, 'checkmate') || !gamerules.doesColorHaveWinCondition(gameRules, players.BLACK, 'checkmate')) return undefined;
	if (gamerules.getWinConditionCountOfColor(gameRules, players.WHITE) !== 1 || gamerules.getWinConditionCountOfColor(gameRules, players.BLACK) !== 1) return undefined;

	// Only make the draw check if the last move was a capture or promotion or if there is no last move
	const lastMove = moveutil.getLastMove(boardsim.moves);
	if (lastMove && ! (lastMove.flags.capture || lastMove.promotion !== undefined)) return undefined;

	// Only make the draw check if there are less than 11 non-obstacle or gargoyle pieces
	if (boardutil.getPieceCountOfGame(boardsim.pieces, { ignoreRawTypes: new Set([r.OBSTACLE]), ignoreColors: new Set([players.NEUTRAL])}) + boardutil.getPieceCountOfType(boardsim.pieces, r.VOID + e.N) >= 11) return undefined;

	// Create scenario object listing amount of all non-obstacle pieces in the game
	const scenario: Scenario = {};
	// bishops are treated specially and separated by parity
	const bishopsW_count: [number, number] = [0, 0];
	const bishopsB_count: [number, number] = [0, 0];
	for (const idx of boardsim.pieces.coords.values()) {
		const piece = boardutil.getPieceFromIdx(boardsim.pieces, idx)!;
		const [raw, color] = typeutil.splitType(piece.type);
		if (raw === r.OBSTACLE) continue;
		
		else if (raw === r.BISHOP) {
			const parity: 0 | 1 = Number(bimath.abs(piece.coords[0] + piece.coords[1]) % 2n) as 0 | 1;
			if (color === players.WHITE) bishopsW_count[parity] += 1;
			else if (color === players.BLACK) bishopsB_count[parity] += 1;
		}
		else if (piece.type in scenario) {
			const currentCount = scenario[piece.type];
			if (typeof currentCount === 'number') {
				(scenario[piece.type] as number) = currentCount + 1;
			}
		}
		else scenario[piece.type] = 1;
	}

	// add bishop tuples to scenario, and make sure the first entry of the bishop lists is the largest one
	if (sum_tuple_coords(bishopsW_count) !== 0) scenario[r.BISHOP + e.W] = ordered_tuple_descending(bishopsW_count);
	if (sum_tuple_coords(bishopsB_count) !== 0) scenario[r.BISHOP + e.B] = ordered_tuple_descending(bishopsB_count);

	// Temporary: Short-circuit insuffmat check if a player has a pawn that he can promote
	// This is fully enough for the checkmate practice mode, for now
	// Future TODO: Create new scenarios for each possible promotion combination and check them all as well
	if (gameRules.promotionRanks) {
		const promotionListWhite = gameRules.promotionsAllowed![players.WHITE]!;
		const promotionListBlack = gameRules.promotionsAllowed![players.BLACK]!;
		if ((r.PAWN + e.W) in scenario && promotionListWhite.length !== 0) return undefined;
		if ((r.PAWN + e.B) in scenario && promotionListBlack.length !== 0) return undefined;
	}

	// Create scenario object with inverted players
	const invertedScenario: Scenario = {};
	for (const pieceTypeStr in scenario) {
		const pieceInverted = typeutil.invertType(Number(pieceTypeStr));
		invertedScenario[pieceInverted] = scenario[pieceTypeStr]!;
	}

	// Make the draw checks by comparing scenario and invertedScenario to scenrariosForInsuffMat
	if (isScenarioInsuffMat(scenario)) return `${players.NEUTRAL} insuffmat`; // Victor of player NEUTRAL means it was a draw.
	else if (isScenarioInsuffMat(invertedScenario)) return `${players.NEUTRAL} insuffmat`; // Victor of player NEUTRAL means it was a draw.
	else return undefined;
}

export default {
	detectInsufficientMaterial
};