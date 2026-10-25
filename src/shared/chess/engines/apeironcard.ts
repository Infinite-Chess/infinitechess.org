// src/shared/chess/engines/apeironcard.ts

/**
 * The Apeiron engine's support rules: what positions/variants it can actually handle.
 * Shared because both game creation (engine games) and the analysis page
 * (local eval + Game Review) must agree on when the engine may run.
 */

import type { GameFile } from '../logic/gamefile.js';
import type { VariantCode } from '../util/variantcodes.js';
import type { EngineRefusal } from '../util/engineglue.js';
import type { GameruleWinCondition } from '../util/winconutil.js';

import bimath from '../../util/math/bimath.js';
import bounds from '../../util/math/bounds.js';
import boardutil from '../logic/boardutil.js';
import apeironborder from '../logic/apeironborder.js';
import variantmodule from '../logic/variantmodule.js';
import gamerules, { GameRules } from '../util/gamerules.js';
import modutil, { ModifierCode } from '../util/modutil.js';
import typeutil, { Player, RawType, players as p, rawTypes as r } from '../util/typeutil.js';

// Types -----------------------------------------------------------------------

/** Why the engine can't handle a game. Keys into `position_errors.engine` in the shared translations. */
export type EngineSupportCode =
	| 'unsupported_variant'
	| 'unsupported_modifier'
	| 'unsupported_turn_order'
	| 'unsupported_win_rule'
	| 'too_many_pieces'
	| 'unsupported_piece'
	| 'border_too_large'
	| 'out_of_bounds'
	| EngineRefusal;

type SupportedResult = { supported: true } | { supported: false; reason: EngineSupportCode };

// Constants -------------------------------------------------------------------

/**
 * Variants the engine doesn't support, by name, for callers that must know before a variant loads.
 * The rules below never read it; enginevariants.unit.test.ts keeps the two in agreement.
 */
const UNSUPPORTED_VARIANTS: Set<VariantCode> = new Set([
	'4x4x4x4_Chess',
	'5D_Chess',
	'Omega_Cubed',
	'Omega_Fourth',
]);

/**
 * Game modifiers the engine can play (none at the moment).
 *
 * Adding one here obliges `CreateEngineGameMessageSchema` to carry modifiers, engine game
 * creation to validate the variant with them, and every engine-bound ICN to carry them.
 */
const SUPPORTED_MODIFIERS: Set<ModifierCode> = new Set([]);

/** Turn orders the engine understands. It reads only who moves first, then alternates. */
const SUPPORTED_TURN_ORDERS: Player[][] = [
	[p.WHITE, p.BLACK],
	[p.BLACK, p.WHITE],
];

/** Win conditions the engine understands; anything else may crash it. */
const SUPPORTED_WIN_CONDITIONS: GameruleWinCondition[] = ['checkmate', 'royalcapture', 'allroyalscaptured', 'allpiecescaptured']; // prettier-ignore

/** Piece types the engine can move. Neutrals (void/obstacle) are inert blockers, so allowed. */
const SUPPORTED_PIECES: Set<RawType> = new Set([r.VOID, r.OBSTACLE, r.KING, r.GIRAFFE, r.CAMEL, r.ZEBRA, r.KNIGHTRIDER, r.AMAZON, r.QUEEN, r.HAWK, r.CHANCELLOR, r.ARCHBISHOP, r.CENTAUR, r.ROYALCENTAUR, r.ROSE, r.KNIGHT, r.GUARD, r.HUYGEN, r.ROOK, r.BISHOP, r.PAWN]); // prettier-ignore

/** Most pieces a position may hold before the engine is too slow to be of any use. */
const MAX_PIECES = 10_000;

// Individual rule checks ------------------------------------------------------

/**
 * Game-level support that's independent of any single position's piece set: the variant's custom
 * piece movement (4D) the engine can't replay, modifiers, turn order, and win conditions. Unlike
 * {@link isPlaySupported} these require no bounded board — the engine takes coordinates of any
 * size itself.
 */
function checkGameRules(gamefile: GameFile): SupportedResult {
	if (variantmodule.hasCustomMovement(gamefile.variant?.mod))
		return { supported: false, reason: 'unsupported_variant' };

	const modifiersResult = checkModifiers(gamefile.gameRules);
	if (!modifiersResult.supported) return modifiersResult;

	const turnOrderResult = checkTurnOrder(gamefile.gameRules);
	if (!turnOrderResult.supported) return turnOrderResult;

	return checkWinConditions(gamefile.gameRules);
}

/** Only modifiers in {@link SUPPORTED_MODIFIERS}. */
function checkModifiers(gameRules: GameRules): SupportedResult {
	for (const code of modutil.getActiveModifiers(gameRules)) {
		if (!SUPPORTED_MODIFIERS.has(code))
			return { supported: false, reason: 'unsupported_modifier' };
	}
	return { supported: true };
}

/** Only turn orders in {@link SUPPORTED_TURN_ORDERS}. */
function checkTurnOrder(gameRules: GameRules): SupportedResult {
	if (!SUPPORTED_TURN_ORDERS.some((order) => gamerules.isTurnOrder(gameRules, order)))
		return { supported: false, reason: 'unsupported_turn_order' };
	return { supported: true };
}

/** Only checkmate-family win conditions are understood. */
function checkWinConditions(gameRules: GameRules): SupportedResult {
	const used: GameruleWinCondition[] = Object.values(gameRules.winConditions).flat();
	for (const winCondition of used) {
		if (!SUPPORTED_WIN_CONDITIONS.includes(winCondition))
			return { supported: false, reason: 'unsupported_win_rule' };
	}
	return { supported: true };
}

/** No more than {@link MAX_PIECES} pieces. */
function checkPieceCount(count: number): SupportedResult {
	if (count > MAX_PIECES) return { supported: false, reason: 'too_many_pieces' };
	return { supported: true };
}

/** Every piece type present must be one the engine can move. */
function checkPieceTypes(rawTypes: Iterable<RawType>): SupportedResult {
	for (const rawType of rawTypes) {
		if (!SUPPORTED_PIECES.has(rawType))
			return { supported: false, reason: 'unsupported_piece' };
	}
	return { supported: true };
}

// Entry points ----------------------------------------------------------------

/**
 * Whether the engine can PLAY the given game (engine games). Requires a bounded board within the
 * engine's safe coordinate range — engine games always run inside a world border, so the gamefile
 * must be constructed from apeironborder's play border for this to pass.
 *
 * Judged on the CURRENT position, since that's what an engine game plays on from here.
 */
function isPlaySupported(gamefile: GameFile): SupportedResult {
	const turnOrderResult = checkTurnOrder(gamefile.gameRules);
	if (!turnOrderResult.supported) return turnOrderResult;

	const winConsResult = checkWinConditions(gamefile.gameRules);
	if (!winConsResult.supported) return winConsResult;

	// World border larger than i64, or absent, is unsupported.
	const cap = apeironborder.cap(gamefile.dateTimestamp);
	const worldBorder = gamefile.gameRules.worldBorder;
	if (
		!worldBorder ||
		Object.values(worldBorder).some((edge) => edge === null || bimath.abs(edge) > cap)
	) {
		return { supported: false, reason: 'border_too_large' };
	}

	// No piece may lie outside the border. Only reachable for a border generated around this position
	// and then clipped by the cap — an explicit one is validated upstream in validatePosition.
	const piecesBox = boardutil.getBoundingBoxOfAllPieces(gamefile.pieces);
	if (piecesBox !== undefined && !bounds.boxContainsBox(worldBorder, piecesBox)) {
		return { supported: false, reason: 'out_of_bounds' };
	}

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
 * Whether the engine can analyze the CURRENTLY VIEWED position (analysis-board local eval).
 * The piece count and types checked are the current board's — a capture can bring a position that
 * was unplayable (too many pieces / an unsupported piece) back into range, so we don't disqualify
 * a game for something at another ply. The engine may still refuse the position itself ({@link EngineRefusal}).
 */
function isAnalysisSupported(gamefile: GameFile): SupportedResult {
	const gameRulesResult = checkGameRules(gamefile);
	if (!gameRulesResult.supported) return gameRulesResult;

	const pieceCountResult = checkPieceCount(gamefile.pieces.coords.size);
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
 * Uses the STARTING position's piece count — the maximum, since pieces only ever decrease — and
 * every piece type that appears across the game (start pieces plus promotion targets).
 * A position the engine refuses ({@link EngineRefusal}) is left as a gap in the review.
 */
function isGameReviewSupported(gamefile: GameFile): SupportedResult {
	const gameRulesResult = checkGameRules(gamefile);
	if (!gameRulesResult.supported) return gameRulesResult;

	const pieceCountResult = checkPieceCount(gamefile.startSnapshot.position.size);
	if (!pieceCountResult.supported) return pieceCountResult;

	return checkPieceTypes(gamefile.existingRawTypes);
}

// Exports ---------------------------------------------------------------------

export default {
	// Constants
	UNSUPPORTED_VARIANTS,
	SUPPORTED_MODIFIERS,
	// Functions
	isPlaySupported,
	isAnalysisSupported,
	isGameReviewSupported,
};
