// src/shared/chess/logic/insufficientmaterial.ts

/**
 * This script detects draws by insufficient material
 *
 * TODO:
 *
 * Add the following piece combinations as insuffmat:
 * * 1k1p-1K (requires simulating all possible promotions according to gamerules)
 */

import type { Board } from './gamefile.js';
import type { GameRules } from '../util/gamerules.js';
import type { GameConclusion } from '../util/winconutil.js';

import bimath from '../../util/math/bimath.js';
import typeutil from '../util/typeutil.js';
import moveutil from '../util/moveutil.js';
import boardutil from '../util/boardutil.js';
import gamerules from '../util/gamerules.js';
import { rawTypes as r, ext as e, players as p, TypeGroup } from '../util/typeutil.js';

// Types -----------------------------------------------------------------------

/** Represents a piece's count, using a tuple for bishops to count them on light and dark squares separately. */
type PieceCount = number | [number, number];
/** Defines an object mapping piece types to their counts, representing a specific collection of pieces on the board. */
type Scenario = TypeGroup<PieceCount>;

// Constants -------------------------------------------------------------------

/**
 * If the world border exists and is closer than this number in any direction,
 * then take the world border under consideration when doing insuffmat checks
 */
const boundForWorldBorderConsideration = 1_000_000n;

/**
 * List of scenarios that are a draw by insufficient material (checkmate and helpmate impossible).
 * In each of these, black is the one being asked whether they're checkmateable.
 *
 * Entries for bishops are given by tuples ordered in descending order, because
 * of parity, so that bishops on different colored squares are treated separately.
 */
const INSUFFMAT_SCENARIOS: readonly Scenario[] = [
	// Both sides have one king
	...withPieces({ [r.KING + e.W]: 1, [r.KING + e.B]: 1 }, [
		{ [r.QUEEN + e.W]: 1 }, // 1K1Q-1k
		{ [r.BISHOP + e.W]: [Infinity, 1] },
		{ [r.KNIGHT + e.W]: 3 }, // 1K3N-1k
		{ [r.HAWK + e.W]: 2 },
		{ [r.HAWK + e.W]: 1, [r.BISHOP + e.W]: [1, 0] },
		{ [r.ROOK + e.W]: 1, [r.KNIGHT + e.W]: 1, [r.KNIGHT + e.B]: 1 }, // 1K1R1N-1k1n
		{ [r.ROOK + e.W]: 1, [r.KNIGHT + e.W]: 1, [r.BISHOP + e.B]: [1, 0] }, // 1K1R1N-1k1b
		{ [r.ROOK + e.W]: 1, [r.BISHOP + e.W]: [1, 0] },
		{ [r.ROOK + e.W]: 1, [r.ROOK + e.B]: 1 },
		{ [r.ARCHBISHOP + e.W]: 1, [r.BISHOP + e.W]: [1, 0] },
		{ [r.ARCHBISHOP + e.W]: 1, [r.KNIGHT + e.W]: 1 },
		{ [r.KNIGHT + e.W]: 1, [r.BISHOP + e.W]: [Infinity, 0] },
		{ [r.KNIGHT + e.W]: 1, [r.BISHOP + e.W]: [1, 1] },
		{ [r.KNIGHT + e.W]: 1, [r.BISHOP + e.W]: [1, 0], [r.KNIGHT + e.B]: 1 }, // 1K1N1B-1k1n
		{ [r.KNIGHT + e.W]: 1, [r.BISHOP + e.W]: [1, 0], [r.BISHOP + e.B]: [1, 0] }, // 1K1N1B-1k1b
		{ [r.KNIGHT + e.W]: 1, [r.BISHOP + e.W]: [1, 0], [r.ROOK + e.B]: 1 }, // 1K1N1B-1k1r
		{ [r.KNIGHT + e.W]: 2, [r.BISHOP + e.W]: [1, 0] },
		{ [r.KNIGHT + e.W]: 2, [r.KNIGHT + e.B]: 1 }, // 1K2N-1k1
		{ [r.GUARD + e.W]: 1 },
		{ [r.CHANCELLOR + e.W]: 1 },
		{ [r.KNIGHTRIDER + e.W]: 2 },
		{ [r.PAWN + e.W]: 3 },
		{ [r.HUYGEN + e.W]: 2, [r.HUYGEN + e.B]: 1 }, // 1K2HU-1k1hu
	]),
	// Only one side has a king (black, the side being checkmated)
	...withPieces({ [r.KING + e.B]: 1 }, [
		{ [r.QUEEN + e.W]: 1, [r.ROOK + e.W]: 1 },
		{ [r.QUEEN + e.W]: 1, [r.KNIGHT + e.W]: 1 },
		{ [r.QUEEN + e.W]: 1, [r.BISHOP + e.W]: [1, 0] },
		{ [r.QUEEN + e.W]: 1, [r.PAWN + e.W]: 1 },
		{ [r.BISHOP + e.W]: [2, 2] },
		{ [r.KNIGHT + e.W]: 4 },
		{ [r.KNIGHT + e.W]: 2, [r.BISHOP + e.W]: [Infinity, 0] },
		{ [r.KNIGHT + e.W]: 2, [r.BISHOP + e.W]: [1, 1] },
		{ [r.KNIGHT + e.W]: 1, [r.BISHOP + e.W]: [2, 1] },
		{ [r.HAWK + e.W]: 3 },
		{ [r.ROOK + e.W]: 1, [r.KNIGHT + e.W]: 1, [r.BISHOP + e.W]: [1, 0] },
		{ [r.ROOK + e.W]: 1, [r.KNIGHT + e.W]: 1, [r.PAWN + e.W]: 1 },
		{ [r.ROOK + e.W]: 1, [r.KNIGHT + e.W]: 2 },
		{ [r.ROOK + e.W]: 1, [r.GUARD + e.W]: 1 },
		{ [r.ROOK + e.W]: 2, [r.BISHOP + e.W]: [1, 0] },
		{ [r.ROOK + e.W]: 2, [r.KNIGHT + e.W]: 1 },
		{ [r.ROOK + e.W]: 2, [r.PAWN + e.W]: 1 },
		{ [r.ARCHBISHOP + e.W]: 1, [r.BISHOP + e.W]: [2, 0] },
		{ [r.ARCHBISHOP + e.W]: 1, [r.BISHOP + e.W]: [1, 1] },
		{ [r.ARCHBISHOP + e.W]: 1, [r.KNIGHT + e.W]: 2 },
		{ [r.ARCHBISHOP + e.W]: 2 },
		{ [r.CHANCELLOR + e.W]: 1, [r.GUARD + e.W]: 1 },
		{ [r.CHANCELLOR + e.W]: 1, [r.KNIGHT + e.W]: 1 },
		{ [r.CHANCELLOR + e.W]: 1, [r.ROOK + e.W]: 1 },
		{ [r.GUARD + e.W]: 2 },
		{ [r.AMAZON + e.W]: 1 },
		{ [r.KNIGHTRIDER + e.W]: 3 },
		{ [r.PAWN + e.W]: 6 },
		{ [r.HUYGEN + e.W]: 4 },
	]),
	// Only royals -> Can never check each other let alone checkmate each other
	{ [r.KING + e.B]: Infinity, [r.KING + e.W]: Infinity },
	{ [r.ROYALCENTAUR + e.B]: Infinity, [r.ROYALCENTAUR + e.W]: Infinity },
];

/**
 * Same as {@link INSUFFMAT_SCENARIOS} but for games with a world border nearby.
 * These are less strict, as you require less pieces to be able to checkmate
 * when receiving help from the world border.
 */
const INSUFFMAT_SCENARIOS_FINITE: readonly Scenario[] = [
	// Both sides have one king
	...withPieces({ [r.KING + e.W]: 1, [r.KING + e.B]: 1 }, [
		{ [r.BISHOP + e.W]: [Infinity, 0] },
		{ [r.KNIGHT + e.W]: 2 },
	]),
	// Only royals -> Can never check each other let alone checkmate each other (same as infinite case)
	{ [r.KING + e.W]: Infinity, [r.KING + e.B]: Infinity },
	{ [r.ROYALCENTAUR + e.W]: Infinity, [r.ROYALCENTAUR + e.B]: Infinity },
];

// Validate at run time that no scenario in any list is a subset of another in the same list
{
	for (const scenarios of [INSUFFMAT_SCENARIOS, INSUFFMAT_SCENARIOS_FINITE]) {
		for (let i = 0; i < scenarios.length; i++) {
			for (let j = 0; j < scenarios.length; j++) {
				if (i === j) continue;
				if (isSubsumedBy(scenarios[i]!, scenarios[j]!)) {
					throw new Error(
						`Redundant insuffmat scenario: ${makeScenReadable(scenarios[i]!)} is a subset of: ${makeScenReadable(scenarios[j]!)}.`,
					);
				}
			}
		}
	}
	function makeScenReadable(scen: Scenario): string {
		const transformed = Object.fromEntries(
			Object.entries(scen).map(([key, val]) => [typeutil.debugType(Number(key)), val]),
		);
		return JSON.stringify(transformed);
	}
}

// Helpers ----------------------------------------------------------------------

/**
 * Merges a set of additional pieces into every scenario in the list.
 * Used to factor out pieces that are implicitly shared across a group of scenarios.
 * @param addedPieces - the pieces to add to every scenario in the list
 * @param scenarios - the list of scenarios to add the pieces to
 */
function withPieces(addedPieces: Scenario, scenarios: readonly Scenario[]): Scenario[] {
	return scenarios.map((s) => ({ ...addedPieces, ...s }));
}

/**
 * Checks if scenario a is subsumed by scenario b, i.e. every piece type
 * in a is present in b with a count at least as large. If true, a is
 * redundant and an insufficient material scenario.
 */
function isSubsumedBy(a: Scenario, b: Scenario): boolean {
	for (const key in a) {
		if (!(key in b) || has_more_pieces(a[key]!, b[key]!)) return false;
	}
	return true;
}

/**
 * Checks if a is larger than b, either as a number, or if it has some larger entry as a tuple
 * @param a - number or tuple of two numbers
 * @param b - number or tuple of two numbers
 */
function has_more_pieces(a: PieceCount, b: PieceCount): boolean {
	if (typeof a === 'number' && typeof b === 'number') {
		return a > b;
	} else if (a instanceof Array && b instanceof Array) {
		const bArray = b as [number, number];
		return a[0] > bArray[0] || a[1] > bArray[1];
	} else {
		throw new Error(`[Insuffmat] Invalid piece count comparison between ${a} and ${b}`);
	}
}

/**
 * Detects if the provided piecelist scenario is a draw by insufficient material
 * @param scenario - scenario of piececounts in the game, e.g. {'kingsB': 1, 'kingsW': 1, 'queensW': 3}
 * @param worldBorderNearOrigin - whether the world border is near the origin
 * @returns *true*, if the scenario is a draw by insufficient material, otherwise *false*
 */
function isScenarioInsuffMat(scenario: Scenario, worldBorderNearOrigin: boolean): boolean {
	const scenarios = worldBorderNearOrigin ? INSUFFMAT_SCENARIOS_FINITE : INSUFFMAT_SCENARIOS;
	for (const drawScenario of scenarios) {
		if (isSubsumedBy(scenario, drawScenario)) return true;
	}
	return false;
}

/**
 * @param tuple - tuple of two numbers
 * @returns sum of tuple entries
 */
function sum_tuple_coords(tuple: [number, number]): number {
	return tuple[0] + tuple[1];
}

/**
 * @param tuple - tuple of two numbers
 * @returns tuple ordered in descending order
 */
function ordered_tuple_descending(tuple: [number, number]): [number, number] {
	if (tuple[0] < tuple[1]) return [tuple[1], tuple[0]];
	else return tuple;
}

/**
 * Detects if the game is drawn for insufficient material
 * @param gameRules
 * @param boardsim
 * @returns `{ victor: 0, condition: 'insuffmat' }`, if the game is over by the insufficient material, otherwise *undefined*.
 */
function detectInsufficientMaterial(
	gameRules: GameRules,
	boardsim: Board,
): GameConclusion | undefined {
	// Only make the draw check if the win condition is checkmate for both players
	if (
		!gamerules.doesColorHaveWinCondition(gameRules, p.WHITE, 'checkmate') ||
		!gamerules.doesColorHaveWinCondition(gameRules, p.BLACK, 'checkmate')
	)
		return undefined;
	if (
		gamerules.getWinConditionCountOfColor(gameRules, p.WHITE) !== 1 ||
		gamerules.getWinConditionCountOfColor(gameRules, p.BLACK) !== 1
	)
		return undefined;

	// Only make the draw check if the last move was a capture or promotion or if there is no last move
	const lastMove = moveutil.getLastMove(boardsim.moves);
	if (lastMove && !(lastMove.flags.capture || lastMove.promotion !== undefined)) return undefined;

	// Only make the draw check if there are less than 11 non-obstacle or gargoyle pieces
	if (
		boardutil.getPieceCountOfGame(boardsim.pieces, {
			ignoreRawTypes: new Set([r.OBSTACLE]),
			ignoreColors: new Set([p.NEUTRAL]),
		}) +
			boardutil.getPieceCountOfType(boardsim.pieces, r.VOID + e.N) >=
		11
	)
		return undefined;

	// Check if the world border exists and is closer than boundForWorldBorderConsideration in any direction
	const worldBorderNearOrigin =
		gameRules.worldBorder === undefined
			? false
			: (gameRules.worldBorder.bottom !== null &&
					-gameRules.worldBorder.bottom <= boundForWorldBorderConsideration) ||
				(gameRules.worldBorder.left !== null &&
					-gameRules.worldBorder.left <= boundForWorldBorderConsideration) ||
				(gameRules.worldBorder.right !== null &&
					gameRules.worldBorder.right <= boundForWorldBorderConsideration) ||
				(gameRules.worldBorder.top !== null &&
					gameRules.worldBorder.top <= boundForWorldBorderConsideration);

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
			const parity: 0 | 1 = Number(bimath.abs(piece.coords[0] + piece.coords[1]) % 2n) as
				| 0
				| 1;
			if (color === p.WHITE) bishopsW_count[parity] += 1;
			else if (color === p.BLACK) bishopsB_count[parity] += 1;
		} else if (piece.type in scenario) {
			const currentCount = scenario[piece.type];
			if (typeof currentCount === 'number') {
				(scenario[piece.type] as number) = currentCount + 1;
			}
		} else scenario[piece.type] = 1;
	}

	// add bishop tuples to scenario, and make sure the first entry of the bishop lists is the largest one
	if (sum_tuple_coords(bishopsW_count) !== 0)
		scenario[r.BISHOP + e.W] = ordered_tuple_descending(bishopsW_count);
	if (sum_tuple_coords(bishopsB_count) !== 0)
		scenario[r.BISHOP + e.B] = ordered_tuple_descending(bishopsB_count);

	// Temporary: Short-circuit insuffmat check if a player has a pawn that he can promote
	// This is fully enough for the checkmate practice mode, for now
	// Future TODO: Create new scenarios for each possible promotion combination and check them all as well
	if (gameRules.promotionRanks) {
		const promotionListWhite = gameRules.promotionsAllowed![p.WHITE];
		const promotionListBlack = gameRules.promotionsAllowed![p.BLACK];
		if (r.PAWN + e.W in scenario && promotionListWhite?.length !== 0) return undefined;
		if (r.PAWN + e.B in scenario && promotionListBlack?.length !== 0) return undefined;
	}

	// Create scenario object with inverted players
	const invertedScenario: Scenario = {};
	for (const pieceTypeStr in scenario) {
		const pieceInverted = typeutil.invertType(Number(pieceTypeStr));
		invertedScenario[pieceInverted] = scenario[pieceTypeStr]!;
	}

	// Make the draw checks by comparing scenario and invertedScenario to scenariosForInsuffMat
	if (
		isScenarioInsuffMat(scenario, worldBorderNearOrigin) ||
		isScenarioInsuffMat(invertedScenario, worldBorderNearOrigin)
	)
		return { victor: null, condition: 'insuffmat' };

	return undefined;
}

export default {
	detectInsufficientMaterial,
};
