// src/shared/chess/logic/insuffmat/insufficientmaterial.ts

/**
 * Detects draws by insufficient material: positions whose pieces can never be arranged into a
 * checkmate, helpmates included. Decides when a position qualifies and reads its material, every
 * promotion outcome included; whether that material can mate is materials.ts's.
 */

import type { MoveFull } from '../movepiece.js';
import type { GameRules } from '../../util/gamerules.js';
import type { LoadedVariant } from '../gamefile.js';
import type { GameConclusion } from '../../util/typeschemas.js';
import type { BoardKind, Material } from './materials.js';
import type { OrganizedPiecesBase } from '../organizedpieces.js';

import bimath from '../../../util/math/bimath.js';
import moveutil from '../moveutil.js';
import boardutil from '../boardutil.js';
import gamerules from '../../util/gamerules.js';
import materials from './materials.js';
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
		if (!materials.isInsufficient(material, boardKind)) return undefined;
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
		addPiece(base, materials.getCode(piece.type, piece.coords));
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

/** The code of each piece a pawn could become. A promoted colorbound piece's square color is unknown, so it is both. */
function getPawnOutcomes(rawTypes: RawType[], player: Player): string[] {
	return rawTypes.flatMap((rawType) => {
		const type = typeutil.buildType(rawType, player);
		return [...new Set([materials.getCode(type, [0n, 0n]), materials.getCode(type, [0n, 1n])])];
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

// Exports ---------------------------------------------------------------------

export default {
	// Detection
	detect,
};
