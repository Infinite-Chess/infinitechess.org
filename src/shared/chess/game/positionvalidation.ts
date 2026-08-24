// src/shared/chess/game/positionvalidation.ts

/**
 * This script decides whether a position may be used where it's being used: whether it's
 * legal at all (no illegal positions, nor excessively large games), and whether the context
 * asking for it can actually play it. Also the single place their error codes become text.
 */

import type { RawType } from '../../util/typeutil.js';
import type { GameRules } from '../util/gamerules.js';
import type { EngineSupportCode } from '../engines/apeiron_card.js';
import type { ScriptTranslations } from '../../types/script-translations.js';
import type { GameFile, VariantOptions } from '../logic/gamefile.js';

import bounds from '../../util/math/bounds.js';
import moveutil from '../logic/moveutil.js';
import boardutil from '../logic/boardutil.js';
import gamerules from '../util/gamerules.js';
import coordutil from '../../util/coordutil.js';
import checkmate from '../logic/checkmate.js';
import apeiron_card from '../engines/apeiron_card.js';
import variantreader from '../logic/variantreader.js';
import checkdetection from '../logic/checkdetection.js';
import gamefileutility from '../logic/gamefileutility.js';
import { MAX_SERVER_VALIDATABLE_POSITION_LENGTH } from '../variants/servervalidation.js';
import typeutil, { neutralRawTypes, players as p, rawTypes as r } from '../../util/typeutil.js';

// Constants -------------------------------------------------------------------------

/** All colored players required in a complete 4-player game's turn order. */
const FOUR_PLAYER_COLORS: number[] = [p.RED, p.BLUE, p.YELLOW, p.GREEN];

// Types -------------------------------------------------------------------------------

/**
 * Codes returned by {@link validatePosition} when a position is illegal.
 * Callers look up the display label via `t.shared.position_errors[code]`.
 */
export type PositionErrorCode =
	| 'mixed_player_modes'
	| 'incomplete_turn_order'
	| 'position_too_large'
	| 'piece_outside_world_border'
	| 'gargoyles_not_allowed'
	| 'invalid_player_id'
	| 'four_player_checkmate'
	| 'consecutive_turns_with_checkmate'
	| 'invalid_promotion_piece';

/**
 * Every code keying a flat string under `position_errors`: an illegal position, plus the ways
 * an ICN can be unusable ({@link validatePosition} never sees one) and the ways a context can
 * refuse an otherwise-legal position.
 */
export type PositionRejectionCode =
	| PositionErrorCode
	| 'invalid_icn'
	| 'icn_missing_position'
	| 'icn_contains_moves'
	| 'moves_invalid'
	| 'king_capture_on_turn_1'
	| 'no_4d_movement'
	| 'game_over'
	| 'player_missing_pieces'
	| 'too_many_royals_for_checkmate';

/**
 * Why a position was refused. Discriminated because the engine's codes key nested objects
 * (`position_errors.engine.<code>`) — {@link localizeRejection} is the only place that matters.
 */
export type PositionRejection =
	| { kind: 'position'; code: PositionRejectionCode }
	| { kind: 'engine'; code: EngineSupportCode };

// Functions -------------------------------------------------------------------------

/**
 * Validates a VariantOptions object for semantic legality.
 *
 * Checks (in order):
 * 1. White/black and colored (4-player) players in the turn order are mutually exclusive.
 * 2. Mode completeness: 2-player needs both white+black; 4-player needs all 4 colored players.
 * 3. ICN string length is not too large (only when an icn is provided).
 * 4. Every piece lies inside the world border, if one is present.
 * 5. Every non-neutral piece's color is in the turn order.
 *    In 2-player mode, no neutral gargoyle pieces are allowed.
 * 6. Checkmate incompatibility: not 4-player, and no player gets consecutive turns. Mirrors
 *    {@link checkmate.isCompatible}, whose remaining checks (piece count,
 *    slide-line count) only trip on positions far larger than any this ever sees.
 * 7. Every promotion target is a piece a pawn may actually become — see
 *    {@link isValidPromotionPiece}.
 *
 * A pure gate, run BEFORE anything is built from the position: types pack into a Uint8Array as
 * `player * numTypes + rawType`, so an out-of-range player wraps to another piece instead of
 * erroring. Rules needing a real board live in {@link getPlayabilityRejection}.
 *
 * @param variantOptions - The position and game rules to validate.
 * @param icnString - The position's ICN, used solely to check its length. Provide it in
 * seek-creation contexts; pass `undefined` elsewhere to skip the size check.
 * @returns `null` if valid, or a {@link PositionErrorCode} describing the failure.
 */
export function validatePosition(
	variantOptions: VariantOptions,
	icnString: string | undefined,
): PositionErrorCode | null {
	const { position, gameRules } = variantOptions;
	const uniquePlayers = gamerules.getUniquePlayersInTurnOrder(gameRules.turnOrder);
	const turnOrderSet = new Set<number>(uniquePlayers);

	// --- Rule 1: Mode mutual exclusivity (white/black vs colored) ---
	const hasColoredPlayers = uniquePlayers.some((up) => FOUR_PLAYER_COLORS.includes(up));
	const hasTwoPlayerColors = uniquePlayers.some((up) => up === p.WHITE || up === p.BLACK);
	if (hasColoredPlayers && hasTwoPlayerColors) return 'mixed_player_modes';

	const isFourPlayerMode = hasColoredPlayers;

	// --- Rule 2: Mode completeness ---
	if (isFourPlayerMode) {
		for (const up of FOUR_PLAYER_COLORS) {
			if (!turnOrderSet.has(up)) return 'incomplete_turn_order';
		}
	} else if (!turnOrderSet.has(p.WHITE) || !turnOrderSet.has(p.BLACK)) {
		return 'incomplete_turn_order';
	}

	// --- Rule 3: ICN string length limit (seek-hardening only) ---
	if (icnString !== undefined && icnString.length > MAX_SERVER_VALIDATABLE_POSITION_LENGTH) {
		return 'position_too_large';
	}

	// --- Rules 4 & 5: World border containment, piece color and turn order consistency ---
	const neutralExemptRawTypes = new Set<RawType>(neutralRawTypes); // void and obstacle
	const worldBorder = gameRules.worldBorder;

	for (const [coordsKey, pieceType] of position) {
		// Only an explicit world border can exclude a piece — one derived from
		// `worldBorderDist` is built around the position's own bounding box.
		if (worldBorder !== undefined) {
			const coords = coordutil.getCoordsFromKey(coordsKey);
			if (!bounds.boxContainsSquare(worldBorder, coords)) {
				return 'piece_outside_world_border';
			}
		}

		const [rawType, color] = typeutil.splitType(pieceType);

		if (color === p.NEUTRAL) {
			// In 2-player mode, only void and obstacle neutrals are allowed; no gargoyles.
			if (!isFourPlayerMode && !neutralExemptRawTypes.has(rawType)) {
				return 'gargoyles_not_allowed';
			}
		} else {
			// Reject pieces with invalid player IDs (> GREEN).
			if (color !== p.WHITE && color !== p.BLACK && !FOUR_PLAYER_COLORS.includes(color)) {
				return 'invalid_player_id';
			}
			// Non-neutral piece colors must be in the turn order. Otherwise this indicates a 2/4-player mode mismatch.
			if (!turnOrderSet.has(color)) {
				return 'mixed_player_modes';
			}
		}
	}

	// --- Rule 6: Checkmate incompatibility ---
	if (usesCheckmate(gameRules)) {
		// 3+ players allows one to open a discovered attack and a second to capture the king.
		if (isFourPlayerMode) return 'four_player_checkmate';
		// If any player gets 2+ turns in a row, king capture is possible
		if (moveutil.doesAnyPlayerGet2TurnsInARow(gameRules)) {
			return 'consecutive_turns_with_checkmate';
		}
	}

	// --- Rule 7: Promotion targets are pieces a pawn may become ---
	for (const promotionPiece of gameRules.promotion?.pieces ?? []) {
		if (!isValidPromotionPiece(promotionPiece)) return 'invalid_promotion_piece';
	}

	return null; // Position is valid.
}

/**
 * Why the given context can't start a game from an otherwise-legal position, or `null` if it can.
 *
 * Checks (in order):
 * 1. Always: under checkmate, the player to move can't capture a royal. No context may load this
 *    — the check/checkmate logic assumes it away, and hits unexpected states when it happens.
 * 2. Seek: no custom piece movement (4D). A seek carries only a position + gamerules, so such a
 *    variant would silently revert to default movement.
 * 3. Seek: the game isn't already over — there'd be nothing left to play.
 * 4. Seek: every player in the turn order has at least one piece. Having no *royal* is fine, even
 *    under a royal-requiring win condition — they simply can't win (e.g. a practice checkmate PvP).
 * 5. Seek: royal count is within what checkmate can afford. Mirrors the cap in
 *    {@link checkmate.isCompatible}.
 * 6. Engine: the position is one the engine can actually handle.
 *
 * A played-out position may break rule 4 while staying perfectly viewable
 * — pieces get captured. So it live heres, not in {@link validatePosition}.
 *
 * @param gamefile - MUST be the exact board the game will load: moveless, carrying the real game's
 * world border ({@link apeiron_card.PLAY_BORDER} for engine games). Anything else judges a
 * different game.
 * @param context - Which play contexts to judge it by beyond rule 1. Analysis is neither: it
 * loads finished and engine-unplayable games fine.
 */
export function getPlayabilityRejection(
	gamefile: GameFile,
	context: { seek: boolean; engine: boolean },
): PositionRejection | null {
	// --- Rule 1: King capture is not possible on turn 1 ---
	if (usesCheckmate(gamefile.gameRules)) {
		// Whoever moves on turn 2 is the one turn 1 could have taken a royal from.
		const secondToMove = moveutil.getWhosTurnAtMoveIndex(gamefile, 0);
		if (checkdetection.detectCheck(gamefile, secondToMove, false).check) {
			return { kind: 'position', code: 'king_capture_on_turn_1' };
		}
	}

	if (context.seek) {
		// --- Rule 2: No custom piece movement ---
		if (variantreader.hasCustomMovement(gamefile.variant?.mod))
			return { kind: 'position', code: 'no_4d_movement' };

		// --- Rule 3: The game isn't already over ---
		if (gamefileutility.isGameOver(gamefile)) return { kind: 'position', code: 'game_over' };

		// --- Rule 4: Every player has at least one piece ---
		for (const player of gamerules.getUniquePlayersInTurnOrder(gamefile.gameRules.turnOrder)) {
			if (boardutil.getPieceCountOfColor(gamefile.pieces, player) === 0)
				return { kind: 'position', code: 'player_missing_pieces' };
		}

		// --- Rule 5: Royal count is not too high for checkmate ---
		if (
			usesCheckmate(gamefile.gameRules) &&
			boardutil.getRoyalCountOfGame(gamefile.pieces) > checkmate.MAX_ROYALS
		) {
			return { kind: 'position', code: 'too_many_royals_for_checkmate' };
		}
	}

	// --- Rule 6: The engine can handle the position ---
	if (context.engine) {
		const support = apeiron_card.isPlaySupported(gamefile);
		if (!support.supported) return { kind: 'engine', code: support.reason };
	}
	return null;
}

/** The display text for a rejection, in the language of the given translations. */
export function localizeRejection(t: ScriptTranslations, rejection: PositionRejection): string {
	return rejection.kind === 'engine'
		? t.shared.position_errors.engine[rejection.code].message
		: t.shared.position_errors[rejection.code];
}

// Helpers -----------------------------------------------------------------------------

/** Whether any player in the turn order wins by checkmate. */
function usesCheckmate(gameRules: GameRules): boolean {
	return gamerules
		.getUniquePlayersInTurnOrder(gameRules.turnOrder)
		.some((player) => gamerules.doesColorHaveWinCondition(gameRules, player, 'checkmate'));
}

/** Whether a pawn may EVER promote into the given piece. */
export function isValidPromotionPiece(rawType: RawType): boolean {
	return (
		!neutralRawTypes.includes(rawType) &&
		!typeutil.royals.includes(rawType) &&
		rawType !== r.PAWN
	);
}
