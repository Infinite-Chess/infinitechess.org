// src/shared/chess/engines/apeiron_card.ts

/**
 * The Apeiron engine's support rules: what positions/variants it can actually handle.
 * Shared because both game creation (engine games) and the analysis page
 * (local eval + Game Review) must agree on when the engine may run.
 */

import type { GameRules } from '../util/gamerules';
import type { VariantCode } from '../variants/variantregistry';
import type { GameruleWinCondition } from '../util/winconutil';
import type { GameFile, VariantOptions } from '../logic/gamefile';

import bimath from '../../util/math/bimath';
import bounds from '../../util/math/bounds';
import boardutil from '../util/boardutil';
import coordutil from '../util/coordutil';
import { I64_MAX } from '../engine';
import typeutil, { RawType, rawTypes as r, players as p } from '../util/typeutil';

type SupportedResult = { supported: true } | { supported: false; reason: string };

// Constants -------------------------------------------------------------

/** The maximum world border distance the engine can handle. */
const BORDER_CAP = I64_MAX - 1000n; // Small cushion

/** Max non-neutral pieces the engine handles before it bogs down (excludes voids/obstacles). */
const MAX_PIECES = 1000;

const SUPPORTED_VARIANTS: Set<VariantCode> = new Set(['Classical', 'Confined_Classical', 'Classical_Plus', 'Core', 'CoaIP', 'CoaIP_HO', 'CoaIP_RO', 'CoaIP_NO', 'Palace', 'Pawndard', 'Standarch', 'Space_Classic', 'Space', 'Pawn_Horde', 'Knightline', 'Obstocean', 'Chess', 'Omega']); // prettier-ignore

/** Win conditions the engine understands; anything else may crash it. */
const SUPPORTED_WIN_CONDITIONS: GameruleWinCondition[] = ['checkmate', 'royalcapture', 'allroyalscaptured', 'allpiecescaptured']; // prettier-ignore

/** Piece types the engine can move. Neutrals (void/obstacle) are inert blockers, so allowed. */
const SUPPORTED_PIECES: Set<RawType> = new Set([r.VOID, r.OBSTACLE, r.KING, r.GIRAFFE, r.CAMEL, r.ZEBRA, r.KNIGHTRIDER, r.AMAZON, r.QUEEN, r.HAWK, r.CHANCELLOR, r.ARCHBISHOP, r.CENTAUR, r.ROYALCENTAUR, r.ROSE, r.KNIGHT, r.GUARD, r.HUYGEN, r.ROOK, r.BISHOP, r.PAWN]); // prettier-ignore

// Individual rule checks (shared by both entry points) --------------------

// Reason strings are shown in the engine panel's single-line, ellipsis-truncated stats readout.
// Keep each around "Unsupported variant" in length (~20 chars, give or take) — no dynamic names.
// TODO: Localize these

/** Only checkmate-family win conditions are understood. */
function checkWinConditions(gameRules: GameRules): SupportedResult {
	const used: GameruleWinCondition[] = Object.values(gameRules.winConditions).flat();
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
			return { supported: false, reason: `Unsupported piece` };
	}
	return { supported: true };
}

// Entry points ----------------------------------------------------------

/**
 * Whether the engine can PLAY the given position (engine games). Requires a bounded board
 * within the engine's safe coordinate range — engine games always run inside a world border.
 */
function isPositionSupported(variantOptions: VariantOptions): SupportedResult {
	const winConsResult = checkWinConditions(variantOptions.gameRules);
	if (!winConsResult.supported) return winConsResult;

	// World border larger than i64, or absent, is unsupported.
	if (
		!variantOptions.gameRules.worldBorder ||
		Object.values(variantOptions.gameRules.worldBorder).some(
			(dist) => dist === null || bimath.abs(dist) > BORDER_CAP,
		)
	) {
		return { supported: false, reason: `Border too large` };
	}

	// Piece count can't be too high
	const pieceCountResult = checkPositionPieceCount(variantOptions.position.values());
	if (!pieceCountResult.supported) return pieceCountResult;

	// All pieces must sit inside the world border.
	for (const coordsKey of variantOptions.position.keys()) {
		const coords = coordutil.getCoordsFromKey(coordsKey);
		if (!bounds.boxContainsSquare(variantOptions.gameRules.worldBorder, coords))
			return { supported: false, reason: `Out of bounds` };
	}

	const promotionsResult = checkPromotions(variantOptions.gameRules);
	if (!promotionsResult.supported) return promotionsResult;

	const allRawTypes = new Set<RawType>();
	for (const type of variantOptions.position.values()) {
		allRawTypes.add(typeutil.getRawType(type));
	}
	// Promotion can introduce a piece type absent from the starting position.
	for (const rawType of variantOptions.gameRules.promotion?.pieces ?? []) {
		allRawTypes.add(rawType);
	}
	return checkPieceTypes(allRawTypes);
}

/**
 * Game-level support that's independent of any single position's piece set: the variant's movement
 * rules (4D ones the engine can't replay), win conditions, and promotion lines. Unlike
 * {@link isPositionSupported} these apply to a loaded game and require no bounded board — the
 * analysis engine handles out-of-range coordinates itself (blocking/re-basing).
 */
function checkGameRules(gamefile: GameFile): SupportedResult {
	if (gamefile.variant !== undefined && !SUPPORTED_VARIANTS.has(gamefile.variant.code))
		return { supported: false, reason: `Unsupported variant` };

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
	if (currentPieceCount > MAX_PIECES) return { supported: false, reason: `Too many pieces` };

	// Now we have set a realistic upper bound
	const pieceCountResult = checkPositionPieceCount(gamefile.startSnapshot.position.values());
	if (!pieceCountResult.supported) return pieceCountResult;

	return checkPieceTypes(gamefile.existingRawTypes);
}

/**
 * Sets a default world border on the position for an engine game, if it doesn't have one:
 * the pieces' bounding box padded by `worldBorderDist`, capped so no edge exceeds the
 * engine's safe coordinate range. MUTATES the variantOptions' gameRules.
 */
function setDefaultWorldBorder(variantOptions: VariantOptions, worldBorderDist: bigint): void {
	if (variantOptions.gameRules.worldBorder !== undefined) return; // Respect an explicit border.

	const allCoords = [...variantOptions.position.keys()].map((coordsKey) =>
		coordutil.getCoordsFromKey(coordsKey),
	);
	if (allCoords.length === 0) return; // Empty position; leave unset (illegal position anyway).
	const bb = bounds.getBoxFromCoordsList(allCoords);

	// How far can we extend in each direction before hitting the engine's coordinate cap?
	const availableHorz = bimath.min(bb.left + BORDER_CAP, BORDER_CAP - bb.right);
	const availableVert = bimath.min(bb.bottom + BORDER_CAP, BORDER_CAP - bb.top);
	const distHorz = bimath.min(worldBorderDist, availableHorz);
	const distVert = bimath.min(worldBorderDist, availableVert);

	variantOptions.gameRules.worldBorder = {
		left: bb.left - distHorz,
		right: bb.right + distHorz,
		bottom: bb.bottom - distVert,
		top: bb.top + distVert,
	};
}

export default {
	// Constants
	BORDER_CAP,
	SUPPORTED_VARIANTS,
	// Functions
	isPositionSupported,
	isAnalysisSupported,
	isGameReviewSupported,
	setDefaultWorldBorder,
};
