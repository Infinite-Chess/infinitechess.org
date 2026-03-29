// src/shared/chess/logic/insufficientmaterial.ts

/**
 * This script detects draws by insufficient material.
 */

import type { Board } from './gamefile.js';
import type { Coords } from '../util/coordutil.js';
import type { GameRules } from '../util/gamerules.js';
import type { GameConclusion } from '../util/winconutil.js';

import bimath from '../../util/math/bimath.js';
import jsutil from '../../util/jsutil.js';
import moveutil from '../util/moveutil.js';
import boardutil from '../util/boardutil.js';
import gamerules from '../util/gamerules.js';
import coordutil from '../util/coordutil.js';
import typeutil, { Player } from '../util/typeutil.js';
import { rawTypes as r, ext as e, players as p, TypeGroup } from '../util/typeutil.js';

// Types -----------------------------------------------------------------------

/**
 * Represents a piece's count, using a tuple for bishops to count them on light and dark squares separately.
 * The tuple should be SORTED in descending order! Otherwise, some insuffmat checks won't work.
 * i.e. whatever light/dark square has the most bishops should be the first entry of the tuple.
 */
type PieceCount = number | [number, number];
/** Defines an object mapping piece types to their counts, representing a specific collection of pieces on the board. */
type Scenario = TypeGroup<PieceCount>;

// Constants -------------------------------------------------------------------

/**
 * If the world border exists and is closer than this number in any direction,
 * then take the world border under consideration when doing insuffmat checks.
 *
 * Chosen to be as small as possible yet realistically never actually be reached in practice.
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
		{ [r.QUEEN + e.W]: 1, [r.QUEEN + e.B]: 1 },
		{ [r.QUEEN + e.W]: 1, [r.ROOK + e.B]: 1, [r.KNIGHT + e.B]: 1 },
		{ [r.QUEEN + e.W]: 1, [r.BISHOP + e.B]: [1, 0], [r.KNIGHT + e.B]: 1 },
		{ [r.QUEEN + e.W]: 1, [r.BISHOP + e.B]: [1, 1] },
		{ [r.QUEEN + e.W]: 1, [r.KNIGHT + e.B]: 2 },
		{ [r.QUEEN + e.W]: 1, [r.PAWN + e.B]: 1 },
		{ [r.ROOK + e.W]: 1, [r.BISHOP + e.W]: [1, 0], [r.ROOK + e.B]: 1 },
		{ [r.ROOK + e.W]: 1, [r.BISHOP + e.W]: [1, 0], [r.BISHOP + e.B]: [1, 0] },
		{ [r.ROOK + e.W]: 1, [r.KNIGHT + e.W]: 1, [r.BISHOP + e.B]: [1, 0] }, // 1K1R1N-1k1b
		{ [r.ROOK + e.W]: 1, [r.KNIGHT + e.W]: 1, [r.KNIGHT + e.B]: 1 }, // 1K1R1N-1k1n
		{ [r.ROOK + e.W]: 1, [r.PAWN + e.B]: 1 },
		{ [r.BISHOP + e.W]: [Infinity, 1] },
		{ [r.BISHOP + e.W]: [Infinity, 0], [r.KNIGHT + e.W]: 1 },
		{ [r.BISHOP + e.W]: [Infinity, 0], [r.PAWN + e.B]: 1 },
		{ [r.BISHOP + e.W]: [1, 1], [r.KNIGHT + e.W]: 1 },
		{ [r.BISHOP + e.W]: [1, 1], [r.ROOK + e.B]: 1 },
		{ [r.BISHOP + e.W]: [1, 1], [r.BISHOP + e.B]: [1, 0] },
		{ [r.BISHOP + e.W]: [1, 1], [r.KNIGHT + e.B]: 1 },
		{ [r.BISHOP + e.W]: [1, 1], [r.PAWN + e.B]: 1 },
		{ [r.BISHOP + e.W]: [1, 0], [r.KNIGHT + e.W]: 2 },
		{ [r.BISHOP + e.W]: [1, 0], [r.KNIGHT + e.W]: 1, [r.ROOK + e.B]: 1 }, // 1K1N1B-1k1r
		{ [r.BISHOP + e.W]: [1, 0], [r.KNIGHT + e.W]: 1, [r.KNIGHT + e.B]: 1 }, // 1K1N1B-1k1n
		{ [r.BISHOP + e.W]: [1, 0], [r.KNIGHT + e.W]: 1, [r.BISHOP + e.B]: [1, 0] }, // 1K1N1B-1k1b
		{ [r.BISHOP + e.W]: [1, 0], [r.KNIGHT + e.W]: 1, [r.PAWN + e.B]: 1 },
		{ [r.KNIGHT + e.W]: 3 }, // 1K3N-1k
		{ [r.KNIGHT + e.W]: 2, [r.ROOK + e.B]: 1 },
		{ [r.KNIGHT + e.W]: 2, [r.BISHOP + e.B]: [1, 0] },
		{ [r.KNIGHT + e.W]: 2, [r.KNIGHT + e.B]: 1 }, // 1K2N-1k1n
		{ [r.KNIGHT + e.W]: 2, [r.PAWN + e.B]: 1 },
		{ [r.PAWN + e.W]: 3, [r.PAWN + e.B]: 1 },
		// Fairy scenarios
		{ [r.CHANCELLOR + e.W]: 1 },
		{ [r.ARCHBISHOP + e.W]: 1, [r.BISHOP + e.W]: [1, 0] },
		{ [r.ARCHBISHOP + e.W]: 1, [r.KNIGHT + e.W]: 1 },
		{ [r.KNIGHTRIDER + e.W]: 2 },
		{ [r.HAWK + e.W]: 2 },
		{ [r.HAWK + e.W]: 1, [r.BISHOP + e.W]: [1, 0] },
		{ [r.HUYGEN + e.W]: 2, [r.HUYGEN + e.B]: 1 }, // 1K2HU-1k1hu
		{ [r.GUARD + e.W]: 1 },
	]),
	// Only one side has a king (black, the side being checkmated)
	...withPieces({ [r.KING + e.B]: 1 }, [
		{ [r.QUEEN + e.W]: 1, [r.ROOK + e.W]: 1 },
		{ [r.QUEEN + e.W]: 1, [r.KNIGHT + e.W]: 1 },
		{ [r.QUEEN + e.W]: 1, [r.BISHOP + e.W]: [1, 0] },
		{ [r.QUEEN + e.W]: 1, [r.PAWN + e.W]: 1 },
		{ [r.ROOK + e.W]: 2, [r.BISHOP + e.W]: [1, 0] },
		{ [r.ROOK + e.W]: 2, [r.KNIGHT + e.W]: 1 },
		{ [r.ROOK + e.W]: 2, [r.PAWN + e.W]: 1 },
		{ [r.ROOK + e.W]: 1, [r.BISHOP + e.W]: [1, 0], [r.KNIGHT + e.W]: 1 },
		{ [r.ROOK + e.W]: 1, [r.KNIGHT + e.W]: 2 },
		{ [r.ROOK + e.W]: 1, [r.KNIGHT + e.W]: 1, [r.PAWN + e.W]: 1 },
		{ [r.BISHOP + e.W]: [Infinity, 0], [r.KNIGHT + e.W]: 2 },
		{ [r.BISHOP + e.W]: [2, 2] },
		{ [r.BISHOP + e.W]: [2, 1], [r.KNIGHT + e.W]: 1 },
		{ [r.BISHOP + e.W]: [1, 1], [r.KNIGHT + e.W]: 2 },
		{ [r.KNIGHT + e.W]: 4 },
		{ [r.PAWN + e.W]: 6 },
		// Fairy scenarios
		{ [r.AMAZON + e.W]: 1 },
		{ [r.CHANCELLOR + e.W]: 1, [r.ROOK + e.W]: 1 },
		{ [r.CHANCELLOR + e.W]: 1, [r.KNIGHT + e.W]: 1 },
		{ [r.ARCHBISHOP + e.W]: 2 },
		{ [r.ARCHBISHOP + e.W]: 1, [r.BISHOP + e.W]: [2, 0] },
		{ [r.ARCHBISHOP + e.W]: 1, [r.BISHOP + e.W]: [1, 1] },
		{ [r.ARCHBISHOP + e.W]: 1, [r.KNIGHT + e.W]: 2 },
		{ [r.KNIGHTRIDER + e.W]: 3 },
		{ [r.HUYGEN + e.W]: 4 },
	]),
	// Only royals -> Can never check each other let alone checkmate each other
	{ [r.KING + e.W]: Infinity, [r.KING + e.B]: Infinity },
	{ [r.ROYALCENTAUR + e.W]: Infinity, [r.ROYALCENTAUR + e.B]: Infinity },
	// For practice checkmate 2AM-1rc
	{ [r.AMAZON + e.W]: 1, [r.ROYALCENTAUR + e.B]: 1 },
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
		{ [r.KNIGHT + e.W]: 1 },
	]),
	// Only royals -> Can never check each other let alone checkmate each other (same as infinite case)
	{ [r.KING + e.W]: Infinity, [r.KING + e.B]: Infinity },
	{ [r.ROYALCENTAUR + e.W]: Infinity, [r.ROYALCENTAUR + e.B]: Infinity },
];

// Validate at run time that no scenario is a subset of another
{
	for (const scenarios of [INSUFFMAT_SCENARIOS, INSUFFMAT_SCENARIOS_FINITE]) {
		for (let i = 0; i < scenarios.length; i++) {
			for (let j = 0; j < scenarios.length; j++) {
				if (i === j) continue;
				if (isSubsumedBy(scenarios[i]!, scenarios[j]!)) {
					throw new Error(
						`Redundant insuffmat scenario:\n${makeScenReadable(scenarios[i]!)}   IS A SUBSET OF:\n${makeScenReadable(scenarios[j]!)}.`,
					);
				}
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
		if (!(key in b) || hasMorePieces(a[key]!, b[key]!)) return false;
	}
	return true;
}

/**
 * Checks if a is larger than b, either as a number, or if it has some larger entry as a tuple
 * @param a - number or tuple of two numbers
 * @param b - number or tuple of two numbers
 */
function hasMorePieces(a: PieceCount, b: PieceCount): boolean {
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
 * @param boardIsFinite - Whether the world border is close enough to assist with checkmate.
 * @returns *true*, if the scenario is a draw by insufficient material, otherwise *false*
 */
function isScenarioInsuffMat(scenario: Scenario, boardIsFinite: boolean): boolean {
	const scenarios = boardIsFinite ? INSUFFMAT_SCENARIOS_FINITE : INSUFFMAT_SCENARIOS;
	return scenarios.some((drawScenario) => isSubsumedBy(scenario, drawScenario));
}

/**
 * Returns the parity of the square coordinates.
 * 0 = Dark square. 1 = Light square.
 */
function getCoordsParity(coords: Coords): 0 | 1 {
	return Number(bimath.abs(coords[0] + coords[1]) % 2n) as 0 | 1;
}

function sumTupleCount(tuple: [number, number]): number {
	return tuple[0] + tuple[1];
}

function orderTupleDescending(tuple: [number, number]): [number, number] {
	if (tuple[0] < tuple[1]) return [tuple[1], tuple[0]];
	else return tuple;
}

// Main Logic ---------------------------------------------------------------

/** Whether the position supports insufficient material checks. */
function doesPositionSupportInsuffmat(gameRules: GameRules, boardsim: Board): boolean {
	// Is the win condition is checkmate for both players?
	if (
		!gamerules.doesColorHaveWinCondition(gameRules, p.WHITE, 'checkmate') ||
		!gamerules.doesColorHaveWinCondition(gameRules, p.BLACK, 'checkmate')
	)
		return false;
	if (
		gamerules.getWinConditionCountOfColor(gameRules, p.WHITE) !== 1 ||
		gamerules.getWinConditionCountOfColor(gameRules, p.BLACK) !== 1
	)
		return false;

	// Was the last move a capture or promotion
	const lastMove = moveutil.getLastMove(boardsim.moves);
	if (lastMove && !(lastMove.flags.capture || lastMove.promotion !== undefined)) return false;

	// Is there less than 11 non-obstacle or gargoyle pieces?
	if (
		boardutil.getPieceCountOfGame(boardsim.pieces, {
			ignoreRawTypes: new Set([r.OBSTACLE]),
			ignoreColors: new Set([p.NEUTRAL]),
		}) +
			boardutil.getPieceCountOfType(boardsim.pieces, r.VOID + e.N) >=
		11
	)
		return false;

	return true;
}

/**
 * Builds the current piece scenario that is on the board.
 * @param boardsim
 * @param exclude - Optional function, run for each piece, that returns
 * whether that piece should be excluded from the scenario.
 */
function buildBoardScenario(boardsim: Board, exclude?: (coords: Coords) => boolean): Scenario {
	// Create scenario object listing amount of all non-obstacle pieces in the game
	const scenario: Scenario = {};
	// bishops are treated specially and separated by parity
	const bishopsW_count: [number, number] = [0, 0];
	const bishopsB_count: [number, number] = [0, 0];
	for (const idx of boardsim.pieces.coords.values()) {
		const piece = boardutil.getDefinedPieceFromIdx(boardsim.pieces, idx)!;
		const [rawType, player] = typeutil.splitType(piece.type);
		if (rawType === r.OBSTACLE) continue;
		if (exclude && exclude(piece.coords))
			continue; // Exlude this piece as specified by the custom exclude() function
		else if (rawType === r.BISHOP) {
			const parity: 0 | 1 = getCoordsParity(piece.coords);
			if (player === p.WHITE) bishopsW_count[parity] += 1;
			else if (player === p.BLACK) bishopsB_count[parity] += 1;
		} else if (piece.type in scenario) {
			const currentCount = scenario[piece.type];
			if (typeof currentCount === 'number') scenario[piece.type] = currentCount + 1;
			else console.error('[Insuffmat] currentCount is not a number');
		} else scenario[piece.type] = 1;
	}

	// add bishop tuples to scenario, as [dark_count, light_count] (NOT yet sorted).
	if (sumTupleCount(bishopsW_count) !== 0) scenario[r.BISHOP + e.W] = bishopsW_count;
	if (sumTupleCount(bishopsB_count) !== 0) scenario[r.BISHOP + e.B] = bishopsB_count;

	return scenario;
}

/**
 * Inverts the player of each scenario piece and returns a new scenario.
 * Non-mutating.
 */
function invertScenario(scenario: Scenario): Scenario {
	// Create scenario object with inverted players
	const invertedScenario: Scenario = {};
	for (const pieceTypeStr in scenario) {
		const pieceInverted = typeutil.invertType(Number(pieceTypeStr));
		invertedScenario[pieceInverted] = scenario[pieceTypeStr]!;
	}

	return invertedScenario;
}

/**
 * Detects if the game is drawn by insufficient material,
 * returning the game conclusion if so.
 */
export function detectInsufficientMaterial(
	gameRules: GameRules,
	boardsim: Board,
): GameConclusion | undefined {
	if (!doesPositionSupportInsuffmat(gameRules, boardsim)) return undefined;

	const boardScenariosToCheck = buildBoardScenarios(gameRules, boardsim);
	if (boardScenariosToCheck === false) return undefined; // Too many promotable pawns, skip insuffmat check entirely to avoid exponential blowup.

	// console.log('Checking insuffmat scenarios:', boardScenariosToCheck.map(makeScenReadable));

	const invertedBoardScenariosToCheck = boardScenariosToCheck.map((scen) => invertScenario(scen));

	// Is the world border close enough to assist checkmate?
	// prettier-ignore
	const boardIsFinite =
		gameRules.worldBorder === undefined ? false
			: (gameRules.worldBorder.bottom !== null && -gameRules.worldBorder.bottom <= boundForWorldBorderConsideration) ||
			  (gameRules.worldBorder.left !== null && -gameRules.worldBorder.left <= boundForWorldBorderConsideration) ||
			  (gameRules.worldBorder.right !== null && gameRules.worldBorder.right <= boundForWorldBorderConsideration) ||
			  (gameRules.worldBorder.top !== null && gameRules.worldBorder.top <= boundForWorldBorderConsideration);

	// It is draw by insuffmat if EVERY board scenario pair is insuffmat.
	// A pair is insuffmat if itself OR its invert is insuffmat.
	for (let i = 0; i < boardScenariosToCheck.length; i++) {
		const scenario = boardScenariosToCheck[i]!;
		const invertedScenario = invertedBoardScenariosToCheck[i]!;
		if (
			!isScenarioInsuffMat(scenario, boardIsFinite) &&
			!isScenarioInsuffMat(invertedScenario, boardIsFinite)
		) {
			// console.log('Scenario is not insuffmat:', makeScenReadable(scenario));
			return undefined; // At least one scenario pair is not insuffmat
		}
	}

	// Every scenario pair tested has been insuffmat
	return { victor: null, condition: 'insuffmat' };
}

/**
 * Builds all board scenarios to check for insufficient material, accounting for
 * all possible promotion outcomes of up to 2 promotable pawns.
 * Returns false if there are 3+ promotable pawns (skip insuffmat check entirely).
 */
function buildBoardScenarios(gameRules: GameRules, boardsim: Board): Scenario[] | false {
	// Collect all promotable pawns (across all players) into a flat list
	const promotablePawns: Array<{ coords: Coords; player: Player; pawnType: number }> = [];
	for (const idx of boardsim.pieces.coords.values()) {
		const piece = boardutil.getDefinedPieceFromIdx(boardsim.pieces, idx)!;
		const [rawType, player] = typeutil.splitType(piece.type);
		if (rawType !== r.PAWN) continue; // Not a pawn
		if (player === p.NEUTRAL) continue; // Player neutral can't even move pieces let alone promote pawns
		if ((gameRules.promotionsAllowed?.[player]?.length ?? 0) === 0) continue; // None of them are promotable (this player can't promote to anything)
		if ((gameRules.promotionRanks?.[player]?.length ?? 0) === 0) continue; // Player has no promotion ranks to promote at
		// ASSUME the pawn is behind a promotion rank.
		// Worst case if it isn't: insuffmat isn't triggered when it could be.
		promotablePawns.push({ coords: piece.coords, player, pawnType: piece.type });
	}

	// Due to exponential computation (S^P where S is the number of promotion states and P is the
	// number of promotable pawns), skip the insuffmat check entirely if there are 3+ promotable pawns.
	if (promotablePawns.length > 2) return false;

	// Build a pawnless base scenario with all promotable pawns excluded.
	const pawnlessScenario = buildBoardScenario(boardsim, (coords) =>
		promotablePawns.some((pawn) => coordutil.areCoordsEqual(coords, pawn.coords)),
	);

	/**
	 * One possible piece a promotable pawn could become (including staying as a pawn).
	 * Bishops use `bishopParity` since the promotion square color can't
	 * be predicted, so each color is a separate outcome to check.
	 */
	type PawnOutcome = { pieceType: number; bishopParity?: 0 | 1 };

	/** Returns every possible outcome for a pawn: staying unpromoted, or each promotion piece. */
	function getPawnOutcomes(pawn: { player: Player; pawnType: number }): PawnOutcome[] {
		const outcomes: PawnOutcome[] = [{ pieceType: pawn.pawnType }]; // stays as pawn
		for (const promotionRawType of gameRules.promotionsAllowed![pawn.player]!) {
			const pieceType = typeutil.buildType(promotionRawType, pawn.player);
			if (promotionRawType === r.BISHOP) {
				outcomes.push({ pieceType, bishopParity: 0 }); // dark square
				outcomes.push({ pieceType, bishopParity: 1 }); // light square
			} else {
				outcomes.push({ pieceType });
			}
		}
		return outcomes;
	}

	/** Helper to apply the given pawn outcome to the given scenario, returning a new scenario. Non-mutating. */
	function applyOutcomeToScenario(base: Scenario, outcome: PawnOutcome): Scenario {
		const scen = jsutil.deepCopyObject(base);
		if (outcome.bishopParity !== undefined) {
			if (scen[outcome.pieceType] === undefined) scen[outcome.pieceType] = [0, 0];
			(scen[outcome.pieceType] as [number, number])[outcome.bishopParity] += 1;
			// Do NOT sort here - index 0 = dark, index 1 = light must be preserved across pawn iterations.
		} else {
			scen[outcome.pieceType] = ((scen[outcome.pieceType] as number | undefined) ?? 0) + 1;
		}
		return scen;
	}

	// For each pawn, expand the scenario list by all of its possible outcomes (Cartesian product).
	// For 0 promotable pawns this simply returns [pawnlessScenario] (the base board scenario).
	let scenarios: Scenario[] = [pawnlessScenario];
	for (const pawn of promotablePawns) {
		const outcomes = getPawnOutcomes(pawn);
		scenarios = scenarios.flatMap((base) =>
			outcomes.map((outcome) => applyOutcomeToScenario(base, outcome)),
		);
	}
	/**
	 * Now that all pawn outcomes have been applied, sort bishop tuples into descending order
	 * (as required by isSubsumedBy). This must be deferred until here because
	 * {@link applyOutcomeToScenario} uses index 0 = dark and index 1 = light throughout
	 * construction; sorting mid-loop would corrupt subsequent parity-based increments.
	 */
	for (const scen of scenarios) {
		for (const key in scen) {
			if (scen[key] instanceof Array)
				scen[key] = orderTupleDescending(scen[key] as [number, number]);
		}
	}

	return scenarios;
}
