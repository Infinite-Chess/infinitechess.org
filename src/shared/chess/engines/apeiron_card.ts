// src/shared/chess/engines/apeiron_card.ts

/**
 * The Apeiron engine's support rules: what positions/variants it can actually handle.
 * Shared because both game creation (board editor / engine games) and the analysis page
 * (local eval + Game Review) must agree on when the engine may run.
 */

import type { GameFile, VariantOptions } from '../logic/gamefile';
import type { GameRules } from '../util/gamerules';

import bimath from '../../util/math/bimath';
import bounds from '../../util/math/bounds';
import boardutil from '../util/boardutil';
import coordutil from '../util/coordutil';
import { I64_MAX } from '../engine';
import variantregistry from '../variants/variantregistry';
import typeutil, { RawType, rawTypes as r, players as p } from '../util/typeutil';

type SupportedResult = { supported: true } | { supported: false; reason: string };

// Constants -------------------------------------------------------------

/** The maximum world border distance the engine can handle. */
const BORDER_CAP = I64_MAX - 1000n; // Small cushion

/** Max non-neutral pieces the engine handles before it bogs down (excludes voids/obstacles). */
const MAX_PIECES = 1000;

const SUPPORTED_VARIANTS = new Set([
	'Classical',
	'Confined_Classical',
	'Classical_Plus',
	'Core',
	'CoaIP',
	'CoaIP_HO',
	'CoaIP_RO',
	'CoaIP_NO',
	'Palace',
	'Pawndard',
	'Standarch',
	'Space_Classic',
	'Space',
	'Abundance',
	'Pawn_Horde',
	'Knightline',
	'Obstocean',
	'Chess',
	'Omega',
]);

/** Win conditions the engine understands; anything else may crash it. */
const SUPPORTED_WIN_CONDITIONS = ['checkmate', 'royalcapture', 'allroyalscaptured', 'allpiecescaptured']; // prettier-ignore

/** Piece types the engine can move. Neutrals (void/obstacle) are inert blockers, so allowed. */
const SUPPORTED_PIECES: Set<RawType> = new Set([
	r.VOID,
	r.OBSTACLE,
	r.KING,
	r.GIRAFFE,
	r.CAMEL,
	r.ZEBRA,
	r.KNIGHTRIDER,
	r.AMAZON,
	r.QUEEN,
	// rawTypes.ROYALQUEEN, // Not extensively tested
	r.HAWK,
	r.CHANCELLOR,
	r.ARCHBISHOP,
	r.CENTAUR,
	r.ROYALCENTAUR,
	r.ROSE,
	r.KNIGHT,
	r.GUARD,
	r.HUYGEN,
	r.ROOK,
	r.BISHOP,
	r.PAWN,
]);

// Individual rule checks (shared by both entry points) --------------------

// Reason strings are shown in the engine panel's single-line, ellipsis-truncated stats readout.
// Keep each around "Unsupported variant" in length (~20 chars, give or take) — no dynamic names.

/** Only checkmate-family win conditions are understood. */
function checkWinConditions(gameRules: GameRules): SupportedResult {
	const used: string[] = Object.values(gameRules.winConditions).flat();
	for (const winCondition of used) {
		if (!SUPPORTED_WIN_CONDITIONS.includes(winCondition))
			return { supported: false, reason: `Unsupported win rule` };
	}
	return { supported: true };
}

/** At most one promotion line per player. */
function checkPromotions(gameRules: GameRules): SupportedResult {
	if (gameRules.promotion) {
		for (const playerRanks of Object.values(gameRules.promotion.ranks)) {
			if (playerRanks.length > 1) return { supported: false, reason: `Too many promotions` };
		}
	}
	return { supported: true };
}

/** No more than {@link MAX_PIECES} non-neutral pieces. */
function checkPieceCount(nonNeutralCount: number): SupportedResult {
	if (nonNeutralCount > MAX_PIECES) return { supported: false, reason: `Too many pieces` };
	return { supported: true };
}

/** Every piece type present must be one the engine can move. */
function checkPieceTypes(rawTypes: Iterable<RawType>): SupportedResult {
	for (const rawType of rawTypes) {
		if (!SUPPORTED_PIECES.has(rawType))
			return { supported: false, reason: `Unsupported piece` };
	}
	return { supported: true };
}

// Entry points ----------------------------------------------------------

/**
 * Whether the engine can PLAY the given position (board editor / engine games). Requires a bounded
 * board within the engine's safe coordinate range — engine games always run inside a world border.
 */
function isPositionSupported(variantOptions: VariantOptions): SupportedResult {
	const winConditions = checkWinConditions(variantOptions.gameRules);
	if (!winConditions.supported) return winConditions;

	// World border larger than i64, or absent, is unsupported.
	if (
		!variantOptions.gameRules.worldBorder ||
		Object.values(variantOptions.gameRules.worldBorder).some(
			(dist) => dist === null || bimath.abs(dist) > BORDER_CAP,
		)
	) {
		return { supported: false, reason: `Border too large` };
	}

	// All pieces must sit inside that world border.
	const allCoords = [...variantOptions.position.keys()].map((key) =>
		coordutil.getCoordsFromKey(key),
	);
	if (
		!bounds.boxContainsBox(
			variantOptions.gameRules.worldBorder,
			bounds.getBoxFromCoordsList(allCoords),
		)
	)
		return { supported: false, reason: `Out of bounds` };

	const promotions = checkPromotions(variantOptions.gameRules);
	if (!promotions.supported) return promotions;

	let nonNeutralCount = 0;
	for (const type of variantOptions.position.values()) {
		if (typeutil.getColorFromType(type) !== p.NEUTRAL) nonNeutralCount++;
	}
	const pieceCount = checkPieceCount(nonNeutralCount);
	if (!pieceCount.supported) return pieceCount;

	return checkPieceTypes(
		[...variantOptions.position.values()].map((type) => typeutil.getRawType(type)),
	);
}

/**
 * Game-level support that's independent of any single position's piece set: the variant's movement
 * rules (4D/5D are ones the engine can't replay), win conditions, and promotion lines. Unlike
 * {@link isPositionSupported} these apply to a loaded game and require no bounded board — the
 * analysis engine handles out-of-range coordinates itself (blocking/re-basing).
 */
function checkGameRules(gamefile: GameFile): SupportedResult {
	if (
		gamefile.variant !== undefined &&
		variantregistry.getVariantGroup(gamefile.variant.code) === '4D'
	)
		return { supported: false, reason: `Unsupported variant` };
	const winConditions = checkWinConditions(gamefile.gameRules);
	if (!winConditions.supported) return winConditions;
	return checkPromotions(gamefile.gameRules);
}

/**
 * Whether the engine can analyze the CURRENTLY VIEWED position (analysis-board local eval). The
 * piece count/types checked are the current board's — a capture or move can bring a position that
 * was unplayable (too many pieces / an unsupported piece) back into range, so we don't disqualify
 * a game for something at another ply. Out-of-bounds is handled separately by the caller.
 */
function isAnalysisSupported(gamefile: GameFile): SupportedResult {
	const gameRules = checkGameRules(gamefile);
	if (!gameRules.supported) return gameRules;

	const pieceCount = checkPieceCount(
		boardutil.getPieceCountOfGame(gamefile.pieces, { ignoreColors: new Set([p.NEUTRAL]) }),
	);
	if (!pieceCount.supported) return pieceCount;

	return checkPieceTypes(
		[...gamefile.pieces.typeRanges.keys()].map((type) => typeutil.getRawType(type)),
	);
}

/**
 * Whether the engine can review the WHOLE game (Game Review evaluates every mainline position).
 * Uses the STARTING position's non-neutral count — the maximum, since pieces only ever decrease —
 * and every piece type that appears across the game (start pieces plus promotion targets). Out-of-
 * bounds positions are NOT disqualifying: the review skips those individually (pieces can return
 * in range), which is why this deliberately performs no world-border check.
 */
function isGameReviewSupported(gamefile: GameFile): SupportedResult {
	const gameRules = checkGameRules(gamefile);
	if (!gameRules.supported) return gameRules;

	let nonNeutralCount = 0;
	const rawTypes = new Set<RawType>();
	for (const type of gamefile.startSnapshot.position.values()) {
		if (typeutil.getColorFromType(type) !== p.NEUTRAL) nonNeutralCount++;
		rawTypes.add(typeutil.getRawType(type));
	}
	const pieceCount = checkPieceCount(nonNeutralCount);
	if (!pieceCount.supported) return pieceCount;

	// A promotion can introduce a piece type absent from the starting position.
	for (const move of gamefile.moves) {
		if (move.promotion !== undefined) rawTypes.add(typeutil.getRawType(move.promotion));
	}
	return checkPieceTypes(rawTypes);
}

export default {
	// Constants
	BORDER_CAP,
	SUPPORTED_VARIANTS,
	// Functions
	isPositionSupported,
	isAnalysisSupported,
	isGameReviewSupported,
};
