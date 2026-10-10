// src/shared/chess/logic/insuffmat/insufficientmaterial.ts

/**
 * Detects draws by insufficient material: positions whose pieces can never be arranged into a
 * checkmate, helpmates included. Decided by the generated table of smallest mating piece sets in
 * matingsets.ts (how it was generated, what is proven, and its known holes:
 * scripts/insuffmat/README.md), plus a list of proven draws above the table's piece cap.
 */

import type { Coords } from '../../../util/coordutil.js';
import type { MoveFull } from '../movepiece.js';
import type { GameRules } from '../../util/gamerules.js';
import type { LoadedVariant } from '../gamefile.js';
import type { GameConclusion } from '../../util/typeschemas.js';
import type { OrganizedPiecesBase } from '../organizedpieces.js';

import bimath from '../../../util/math/bimath.js';
import moveutil from '../moveutil.js';
import boardutil from '../boardutil.js';
import gamerules from '../../util/gamerules.js';
import matingsets from './matingsets.js';
import icnposition from '../icn/icnposition.js';
import variantmodule from '../variantmodule.js';
import typeutil, { Player, RawType } from '../../util/typeutil.js';
import { rawTypes as r, ext as e, players as p } from '../../util/typeutil.js';

// Types -----------------------------------------------------------------------

/** The subset of a Board that insufficient material detection reads. */
type InsuffmatBoard = {
	gameRules: GameRules;
	moves: MoveFull[];
	pieces: OrganizedPiecesBase;
	variant?: LoadedVariant;
};

/** Which table applies: bounded when the world border is close enough to assist checkmate. */
type BoardKind = 'unbounded' | 'bounded';

/**
 * A collection of pieces, counted by code: the piece's ICN abbreviation (uppercase white,
 * lowercase black), with bishops suffixed by their square color, 0 or 1.
 */
type Material = Map<string, number>;

// Constants -------------------------------------------------------------------

/**
 * A world border closer than this in any direction counts toward insuffmat checks; a farther one
 * only does if a sliding royal is on the board, since it can slide there in one move.
 *
 * Chosen to be as small as possible yet realistically never reached by a walking royal.
 */
const BOUND_FOR_WORLD_BORDER_CONSIDERATION = 1_000_000n;

/**
 * Bounded boards narrower than this in either direction never declare insuffmat: the bounded table
 * was only generated down to 8x8, and its mates count for every larger bounded board too.
 */
const MIN_BOUNDED_BOARD_WIDTH = 8n;

/** The pieces of ordinary chess: with obstacles or gargoyles on the board, insuffmat is only declared when every piece is one. */
const CLASSICAL_RAW_TYPES: RawType[] = [r.KING, r.QUEEN, r.ROOK, r.BISHOP, r.KNIGHT, r.PAWN];

/** The smallest mating piece sets of each board kind, by canonical key. */
const MATING_SETS: Record<BoardKind, Set<string>> = {
	unbounded: new Set(matingsets.unbounded.split(' ')),
	bounded: new Set(matingsets.bounded.split(' ')),
};

/**
 * Proven draws with more pieces than the table's cap, each as the most of each piece it allows
 * (Infinity = any number). Black is the side to be mated. Each holds in either color orientation.
 * An entry allowing pawns would let detect() enumerate promotions past the cap, needing a bound again.
 */
const PROVEN_DRAWS: Record<BoardKind, readonly Record<string, number>[]> = {
	unbounded: [
		// For the practice checkmate 1K2N6B-1k losing a knight. Bishops on the king's color never attack its 4
		// orthogonal neighbors, of which the white king covers at most 1 and the knight 2. Bishops on the other
		// color never check, so the knight must, covering at most 1 of the 4 diagonal neighbors to the king's 2.
		{ K: 1, B0: Infinity, N: 1, k: 1 },
	],
	bounded: [],
};

// Detection -------------------------------------------------------------------

/**
 * Detects if the game is drawn by insufficient material,
 * returning the game conclusion if so.
 */
function detect(boardsim: InsuffmatBoard): GameConclusion | undefined {
	if (!doesPositionSupportInsuffmat(boardsim)) return undefined;

	const boardKind = getBoardKind(boardsim);
	if (boardKind === undefined) return undefined;

	const { base, promotablePlayers } = readBoard(boardsim);
	const promotionPieces = boardsim.gameRules.promotion?.pieces ?? [];
	const outcomes = promotablePlayers.map((player) =>
		getPawnOutcomes([r.PAWN, ...promotionPieces], player),
	);

	// A draw only if every promotion outcome is one.
	for (const material of combineOutcomes(base, outcomes))
		if (!isInsufficient(material, boardKind)) return undefined;
	return { victor: null, condition: 'insuffmat' };
}

/** Whether the position supports insufficient material checks. */
function doesPositionSupportInsuffmat(boardsim: InsuffmatBoard): boolean {
	const gameRules = boardsim.gameRules;

	// Is the win condition checkmate for both players?
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

	// The table models default movement: no slide limit (which shortens the defender's escapes too) or variant
	// movement. Voids can shape a mate, which it doesn't model either.
	if (gameRules.slideLimit !== undefined) return false;
	if (variantmodule.hasCustomMovement(boardsim.variant?.mod)) return false;
	if (boardutil.getPieceCountOfType(boardsim.pieces, r.VOID + e.N) > 0) return false;
	// Obstacles and gargoyles, which act alike, can too, but tests found no such mate in classical material
	// with a king each (README).
	if (boardutil.getPieceCountOfColor(boardsim.pieces, p.NEUTRAL) === 0) return true;
	return isClassicalWithKings(boardsim);
}

/** Whether every piece and promotion option is classical, and both players have a king. */
function isClassicalWithKings(boardsim: InsuffmatBoard): boolean {
	const promotions = boardsim.gameRules.promotion?.pieces ?? [];
	if (!promotions.every((rawType) => CLASSICAL_RAW_TYPES.includes(rawType))) return false;
	const countOf = (rawType: RawType, player: Player): number => boardutil.getPieceCountOfType(boardsim.pieces, typeutil.buildType(rawType, player)); // prettier-ignore
	return [p.WHITE, p.BLACK].every(
		(player) =>
			countOf(r.KING, player) > 0 &&
			(Object.values(r) as RawType[]).every(
				(rawType) =>
					CLASSICAL_RAW_TYPES.includes(rawType) || countOf(rawType, player) === 0,
			),
	);
}

/** Which table applies, or undefined when the board is too narrow for either. */
function getBoardKind(boardsim: InsuffmatBoard): BoardKind | undefined {
	const border = boardsim.gameRules.worldBorder;
	if (border === undefined) return 'unbounded';
	const isNear = (edge: bigint | null): boolean => edge !== null && bimath.abs(edge) <= BOUND_FOR_WORLD_BORDER_CONSIDERATION; // prettier-ignore
	const isAnyNear = [border.left, border.right, border.bottom, border.top].some((edge) => isNear(edge)); // prettier-ignore
	// A sliding royal reaches a wall any distance away in one move, so for it no border is too far to help mate.
	if (!isAnyNear && !hasSlidingRoyal(boardsim)) return 'unbounded';
	const isTooNarrow = (low: bigint | null, high: bigint | null): boolean => low !== null && high !== null && high - low + 1n < MIN_BOUNDED_BOARD_WIDTH; // prettier-ignore
	if (isTooNarrow(border.left, border.right) || isTooNarrow(border.bottom, border.top))
		return undefined;
	return 'bounded';
}

/** Whether a sliding royal is on the board. */
function hasSlidingRoyal(boardsim: InsuffmatBoard): boolean {
	const countOf = (type: number): number => boardutil.getPieceCountOfType(boardsim.pieces, type);
	return typeutil.slidingRoyals.some((rawType) =>
		[p.WHITE, p.BLACK].some((player) => countOf(typeutil.buildType(rawType, player)) > 0),
	);
}

// Board Materials -------------------------------------------------------------

/** The board's pieces as a material, setting aside each promotable pawn by its player. */
function readBoard(boardsim: InsuffmatBoard): { base: Material; promotablePlayers: Player[] } {
	const { pieces } = boardsim;
	const promotion = boardsim.gameRules.promotion;
	const promotablePlayers: Player[] = [];
	const base: Material = new Map();
	for (const idx of pieces.coords.values()) {
		const piece = boardutil.getDefinedPieceFromIdx(pieces, idx);
		const [rawType, player] = typeutil.splitType(piece.type);
		if (player === p.NEUTRAL) continue;
		if (rawType === r.PAWN && canPromote(promotion, player, piece.coords[1])) {
			promotablePlayers.push(player);
			continue;
		}
		addPiece(base, getCode(piece.type, piece.coords));
	}
	return { base, promotablePlayers };
}

/** Whether a pawn of the player on rank y has a promotion rank ahead of it: above for white, below for black. */
function canPromote(promotion: GameRules['promotion'], player: Player, y: bigint): boolean {
	if ((promotion?.pieces.length ?? 0) === 0) return false;
	const ranks = promotion?.ranks[player] ?? [];
	if (player === p.WHITE) return ranks.some((rank) => rank > y);
	if (player === p.BLACK) return ranks.some((rank) => rank < y);
	return ranks.length > 0; // Other players' directions are unknown, so any rank counts
}

/** The code of each piece a pawn could become. A promoted bishop's square color is unknown, so it is both. */
function getPawnOutcomes(rawTypes: RawType[], player: Player): string[] {
	return rawTypes.flatMap((rawType) => {
		const type = typeutil.buildType(rawType, player);
		if (rawType !== r.BISHOP) return [getCode(type, [0n, 0n])];
		return [getCode(type, [0n, 0n]), getCode(type, [0n, 1n])];
	});
}

/** Every material the board could become: each promotable pawn replaced by each of its outcomes in turn. */
function* combineOutcomes(base: Material, outcomes: string[][], index = 0): Generator<Material> {
	if (index === outcomes.length) {
		yield base;
		return;
	}
	for (const code of outcomes[index]!) {
		const next = new Map(base);
		addPiece(next, code);
		yield* combineOutcomes(next, outcomes, index + 1);
	}
}

/** Adds one piece of the code to the material. */
function addPiece(material: Material, code: string): void {
	material.set(code, (material.get(code) ?? 0) + 1);
}

/** A piece's code: its ICN abbreviation, with a bishop's square color appended. */
function getCode(type: number, coords: Coords): string {
	const abbr = icnposition.getAbbrFromType(type);
	if (typeutil.getRawType(type) !== r.BISHOP) return abbr;
	return abbr + String(bimath.abs(coords[0] + coords[1]) % 2n);
}

// Table Lookup ----------------------------------------------------------------

/** Whether the material can never be arranged into a checkmate, on the given board kind. */
function isInsufficient(material: Material, boardKind: BoardKind): boolean {
	if (PROVEN_DRAWS[boardKind].some((draw) => doesMaterialFitDraw(material, draw))) return true;
	let pieceCount = 0;
	for (const count of material.values()) pieceCount += count;
	if (pieceCount > matingsets.cap[boardKind]) return false; // Beyond the table: never declared a draw
	return !doesContainMatingSet(material, MATING_SETS[boardKind]);
}

/** Whether every piece of the material fits within the proven draw, in some orientation. */
function doesMaterialFitDraw(material: Material, draw: Record<string, number>): boolean {
	return getOrientations(material).some((variant) =>
		[...variant].every(([code, count]) => count <= (draw[code] ?? 0)),
	);
}

/** Whether some collection of the material's pieces is a listed smallest mating set. */
function doesContainMatingSet(material: Material, matingSets: Set<string>): boolean {
	const codes = [...material.keys()];
	const subset: Material = new Map();
	/** Tries every count of each code from the index on, testing each finished subset. */
	const tryFrom = (index: number): boolean => {
		if (index === codes.length)
			return subset.size > 0 && matingSets.has(getCanonicalKey(subset));
		const code = codes[index]!;
		for (let count = 0; count <= material.get(code)!; count++) {
			if (count === 0) subset.delete(code);
			else subset.set(code, count);
			if (tryFrom(index + 1)) return true;
		}
		subset.delete(code);
		return false;
	};
	return tryFrom(0);
}

// Canonical Keys --------------------------------------------------------------

/**
 * One key shared by a material and its mirror images, which can all mate equally: the smallest
 * of their serializations. matingsets.ts is keyed by it.
 */
function getCanonicalKey(material: Material): string {
	let best: string | undefined;
	for (const variant of getOrientations(material)) {
		const key = serialize(variant);
		if (best === undefined || key < best) best = key;
	}
	return best!;
}

/** The material and its mirror images: colors swapped, bishop square colors swapped, and both. */
function getOrientations(material: Material): Material[] {
	const swapColors = (code: string): string => (code === code.toUpperCase() ? code.toLowerCase() : code.toUpperCase()); // prettier-ignore
	const swapBishops = (code: string): string => (/^b[01]$/i.test(code) ? code[0]! + (code[1] === '0' ? '1' : '0') : code); // prettier-ignore
	const remap = (swap: (code: string) => string): Material => new Map([...material].map(([code, count]) => [swap(code), count])); // prettier-ignore
	return [
		material,
		remap(swapColors),
		remap(swapBishops),
		remap((code) => swapBishops(swapColors(code))),
	];
}

/** The material as text: white's codes, then black's, each sorted and comma-separated. */
function serialize(material: Material): string {
	const white: string[] = [];
	const black: string[] = [];
	for (const [code, count] of material) {
		const side = code === code.toUpperCase() ? white : black;
		for (let i = 0; i < count; i++) side.push(code);
	}
	return `${white.sort().join(',')}/${black.sort().join(',')}`;
}

// Exports ---------------------------------------------------------------------

export default {
	// Detection
	detect,
	// Canonical Keys
	getCanonicalKey,
};
