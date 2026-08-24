// src/shared/chess/engines/apeiron_card.ts

/**
 * The Apeiron engine's support rules: what positions/variants it can actually handle.
 * Shared because both game creation (engine games) and the analysis page
 * (local eval + Game Review) must agree on when the engine may run.
 */

import type { GameRules } from '../util/gamerules.js';
import type { VariantCode } from '../util/variantcodes.js';
import type { GameruleWinCondition } from '../util/winconutil.js';
import type { GameFile, LoadedVariant } from '../logic/gamefile.js';
import type { BoundingBox, UnboundedRectangle } from '../../util/math/bounds.js';

import bimath from '../../util/math/bimath.js';
import bounds from '../../util/math/bounds.js';
import timeutil from '../../util/timeutil.js';
import boardutil from '../logic/boardutil.js';
import { I64_MAX } from '../engine.js';
import typeutil, { RawType, rawTypes as r, players as p } from '../../util/typeutil.js';

/** Why the engine can't handle a game. Keys into `position_errors.engine` in the shared translations. */
export type EngineSupportCode =
	| 'unsupported_variant'
	| 'unsupported_win_rule'
	| 'too_many_promotions'
	| 'too_many_pieces'
	| 'unsupported_piece'
	| 'border_too_large'
	| 'out_of_bounds';

type SupportedResult = { supported: true } | { supported: false; reason: EngineSupportCode };

// Constants -------------------------------------------------------------

/** Max non-neutral pieces the engine handles before it bogs down (excludes voids/obstacles). */
const MAX_PIECES = 1000;

/**
 * Adding a variant here obliges its module to declare `getPositionBox`, unless it declares a
 * `worldBorder` of its own — {@link worldBorderForVariant} has no other way to space a border
 * around it, and throws if neither is present.
 */
const SUPPORTED_VARIANTS: Set<VariantCode> = new Set(['Classical', 'Confined_Classical', 'Classical_Plus', 'Core', 'CoaIP', 'CoaIP_HO', 'CoaIP_RO', 'CoaIP_NO', 'Palace', 'Pawndard', 'Standarch', 'Space_Classic', 'Space', 'Pawn_Horde', 'Knightline', 'Obstocean', 'Chess', 'Omega']); // prettier-ignore

/** Win conditions the engine understands; anything else may crash it. */
const SUPPORTED_WIN_CONDITIONS: GameruleWinCondition[] = ['checkmate', 'royalcapture', 'allroyalscaptured', 'allpiecescaptured']; // prettier-ignore

/** Piece types the engine can move. Neutrals (void/obstacle) are inert blockers, so allowed. */
const SUPPORTED_PIECES: Set<RawType> = new Set([r.VOID, r.OBSTACLE, r.KING, r.GIRAFFE, r.CAMEL, r.ZEBRA, r.KNIGHTRIDER, r.AMAZON, r.QUEEN, r.HAWK, r.CHANCELLOR, r.ARCHBISHOP, r.CENTAUR, r.ROYALCENTAUR, r.ROSE, r.KNIGHT, r.GUARD, r.HUYGEN, r.ROOK, r.BISHOP, r.PAWN]); // prettier-ignore

// The board engine games are played on -------------------------------------

/**
 * The engine's board geometry, time-versioned like a variant's position: `dist` spaces the border
 * out from the starting position's box, `cap` hard-limits any edge to i64 with a cushion. The 1000
 * between them keeps every preset's border evenly spaced; only pieces beyond that trip the cap.
 *
 * NEVER edit an entry — a game must stay on the board it began on. Add one keyed at the change.
 */
const PLAY_BORDER: Record<number, { dist: bigint; cap: bigint }> = {
	0: { dist: I64_MAX - 2000n, cap: I64_MAX - 1000n },
};

/**
 * The world border an engine game is played inside: spaced evenly around the starting position,
 * clamped to what the engine can evaluate. The single source of every engine game's border.
 * @param timestamp - The game's creation time, pinning its {@link PLAY_BORDER} revision.
 */
function worldBorderForBox(positionBox: BoundingBox, timestamp: number): BoundingBox {
	const { dist, cap } = timeutil.resolveAtTimestamp(PLAY_BORDER, timestamp);
	return {
		left: bimath.max(positionBox.left - dist, -cap),
		right: bimath.min(positionBox.right + dist, cap),
		bottom: bimath.max(positionBox.bottom - dist, -cap),
		top: bimath.min(positionBox.top + dist, cap),
	};
}

/**
 * {@link worldBorderForBox} for a preset variant, whose starting position
 * is never built just to measure it — the module declares its box outright.
 */
function worldBorderForVariant(variant: LoadedVariant): BoundingBox {
	const box = variant.mod.getPositionBox?.(variant.dateTimestamp);
	if (box === undefined)
		throw new Error(`Engine-supported variant "${variant.code}" declares no position box.`);
	return worldBorderForBox(box, variant.dateTimestamp);
}

/** {@link PLAY_BORDER}'s `cap` alone, for callers bounding a position rather than spacing a border. */
function worldBorderCap(timestamp: number): bigint {
	return timeutil.resolveAtTimestamp(PLAY_BORDER, timestamp).cap;
}

/**
 * An explicit world border reduced to what the engine can evaluate: every
 * edge pulled inside the cap, and an unbounded (or absent) edge becoming it.
 * @param timestamp - Pins the {@link PLAY_BORDER} revision.
 */
function clampBorderToCap(
	worldBorder: UnboundedRectangle | undefined,
	timestamp: number,
): BoundingBox {
	const cap = worldBorderCap(timestamp);
	return {
		left: bimath.max(worldBorder?.left ?? -cap, -cap),
		right: bimath.min(worldBorder?.right ?? cap, cap),
		bottom: bimath.max(worldBorder?.bottom ?? -cap, -cap),
		top: bimath.min(worldBorder?.top ?? cap, cap),
	};
}

// Individual rule checks (shared by both entry points) --------------------

// Every reason code has both a short `label` (the engine panel's single-line, ellipsis-truncated
// stats readout) and a full-sentence `message` (the variant selector's error text).

/** Only checkmate-family win conditions are understood. */
function checkWinConditions(gameRules: GameRules): SupportedResult {
	const used: GameruleWinCondition[] = Object.values(gameRules.winConditions).flat();
	for (const winCondition of used) {
		if (!SUPPORTED_WIN_CONDITIONS.includes(winCondition))
			return { supported: false, reason: 'unsupported_win_rule' };
	}
	return { supported: true };
}

/** At most one promotion line per player. */
function checkPromotions(gameRules: GameRules): SupportedResult {
	if (gameRules.promotion) {
		for (const playerRanks of Object.values(gameRules.promotion.ranks)) {
			if (playerRanks.length > 1) return { supported: false, reason: 'too_many_promotions' };
		}
	}
	return { supported: true };
}

/** No more than {@link MAX_PIECES} non-neutral pieces. */
function checkPieceCount(nonNeutralCount: number): SupportedResult {
	if (nonNeutralCount > MAX_PIECES) return { supported: false, reason: 'too_many_pieces' };
	return { supported: true };
}

/** Non-neutral piece count of a position map, short-circuiting once it exceeds the cap. */
function checkPositionPieceCount(types: Iterable<number>): SupportedResult {
	let count = 0;
	for (const type of types) {
		if (typeutil.getColorFromType(type) !== p.NEUTRAL && ++count > MAX_PIECES) break;
	}
	return checkPieceCount(count);
}

/** Every piece type present must be one the engine can move. */
function checkPieceTypes(rawTypes: Iterable<RawType>): SupportedResult {
	for (const rawType of rawTypes) {
		if (!SUPPORTED_PIECES.has(rawType))
			return { supported: false, reason: 'unsupported_piece' };
	}
	return { supported: true };
}

// Entry points ----------------------------------------------------------

/**
 * Whether the engine can PLAY the given game (engine games). Requires a bounded board within the
 * engine's safe coordinate range — engine games always run inside a world border, so the gamefile
 * must be constructed from {@link PLAY_BORDER} for this to pass.
 *
 * Judged on the CURRENT position, since that's what an engine game plays on from here.
 */
function isPlaySupported(gamefile: GameFile): SupportedResult {
	const winConsResult = checkWinConditions(gamefile.gameRules);
	if (!winConsResult.supported) return winConsResult;

	// World border larger than i64, or absent, is unsupported.
	const cap = worldBorderCap(gamefile.dateTimestamp);
	const worldBorder = gamefile.gameRules.worldBorder;
	if (
		!worldBorder ||
		Object.values(worldBorder).some((edge) => edge === null || bimath.abs(edge) > cap)
	) {
		return { supported: false, reason: 'border_too_large' };
	}

	const pieceCountResult = checkPieceCount(
		boardutil.getPieceCountOfGame(gamefile.pieces, { ignoreColors: new Set([p.NEUTRAL]) }),
	);
	if (!pieceCountResult.supported) return pieceCountResult;

	// No piece may lie outside the border. Only reachable for a border generated around this position
	// and then clipped by the cap — an explicit one is validated upstream in validatePosition.
	const piecesBox = boardutil.getBoundingBoxOfAllPieces(gamefile.pieces);
	if (piecesBox !== undefined && !bounds.boxContainsBox(worldBorder, piecesBox)) {
		return { supported: false, reason: 'out_of_bounds' };
	}

	const promotionsResult = checkPromotions(gamefile.gameRules);
	if (!promotionsResult.supported) return promotionsResult;

	const allRawTypes = new Set<RawType>();
	for (const idx of gamefile.pieces.coords.values()) {
		allRawTypes.add(typeutil.getRawType(gamefile.pieces.types[idx]!));
	}
	// Promotion can introduce a piece type absent from the board.
	for (const rawType of gamefile.gameRules.promotion?.pieces ?? []) {
		allRawTypes.add(rawType);
	}
	return checkPieceTypes(allRawTypes);
}

/**
 * Game-level support that's independent of any single position's piece set: the variant's movement
 * rules (4D ones the engine can't replay), win conditions, and promotion lines. Unlike
 * {@link isPlaySupported} these require no bounded board — the
 * analysis engine handles out-of-range coordinates itself (blocking/re-basing).
 */
function checkGameRules(gamefile: GameFile): SupportedResult {
	if (gamefile.variant !== undefined && !SUPPORTED_VARIANTS.has(gamefile.variant.code))
		return { supported: false, reason: 'unsupported_variant' };

	const winConsResult = checkWinConditions(gamefile.gameRules);
	if (!winConsResult.supported) return winConsResult;

	return checkPromotions(gamefile.gameRules);
}

/**
 * Whether the engine can analyze the CURRENTLY VIEWED position (analysis-board local eval). The
 * piece count/types checked are the current board's — a capture or move can bring a position that
 * was unplayable (too many pieces / an unsupported piece) back into range, so we don't disqualify
 * a game for something at another ply. Out-of-bounds is handled separately by the caller.
 */
function isAnalysisSupported(gamefile: GameFile): SupportedResult {
	const gameRulesResult = checkGameRules(gamefile);
	if (!gameRulesResult.supported) return gameRulesResult;

	const pieceCountResult = checkPieceCount(
		boardutil.getPieceCountOfGame(gamefile.pieces, { ignoreColors: new Set([p.NEUTRAL]) }),
	);
	if (!pieceCountResult.supported) return pieceCountResult;

	const allRawTypes = new Set<RawType>();
	for (const idx of gamefile.pieces.coords.values()) {
		const type = gamefile.pieces.types[idx]!;
		allRawTypes.add(typeutil.getRawType(type));
	}
	return checkPieceTypes(allRawTypes);
}

/**
 * Whether the engine can review the WHOLE game (Game Review evaluates every mainline position).
 * Uses the STARTING position's non-neutral count — the maximum, since pieces only ever decrease —
 * and every piece type that appears across the game (start pieces plus promotion targets). Out-of-
 * bounds positions are NOT disqualifying: the review skips those individually (pieces can return
 * in range), which is why this deliberately performs no world-border check.
 */
function isGameReviewSupported(gamefile: GameFile): SupportedResult {
	const gameRulesResult = checkGameRules(gamefile);
	if (!gameRulesResult.supported) return gameRulesResult;

	// Quickly check if the current position's piece count is already too
	// high, before counting every single piece in the start position.
	const currentPieceCount = boardutil.getPieceCountOfGame(gamefile.pieces, {
		ignoreColors: new Set([p.NEUTRAL]),
	});
	if (currentPieceCount > MAX_PIECES) return { supported: false, reason: 'too_many_pieces' };

	// Now we have set a realistic upper bound
	const pieceCountResult = checkPositionPieceCount(gamefile.startSnapshot.position.values());
	if (!pieceCountResult.supported) return pieceCountResult;

	return checkPieceTypes(gamefile.existingRawTypes);
}

export default {
	// Constants
	SUPPORTED_VARIANTS,
	// Functions
	worldBorderForBox,
	worldBorderForVariant,
	worldBorderCap,
	clampBorderToCap,
	isPlaySupported,
	isAnalysisSupported,
	isGameReviewSupported,
};
