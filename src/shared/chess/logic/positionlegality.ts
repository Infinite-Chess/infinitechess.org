// src/shared/chess/logic/positionlegality.ts

/**
 * Whether a position is legal AT ALL, judged from the raw position and gamerules alone.
 *
 * A pure gate, run BEFORE a board is built from the position. Whether a given context may
 * then start a game from it — which needs a constructed GameFile — is playability.ts's.
 */

import type { RawType } from '../../util/typeutil.js';
import type { VariantOptions } from './gamefile.js';

import bounds from '../../util/math/bounds.js';
import moveutil from './moveutil.js';
import gamerules from '../util/gamerules.js';
import coordutil from '../../util/coordutil.js';
import gamelimits from '../util/gamelimits.js';
import typeutil, { neutralRawTypes, players as p } from '../../util/typeutil.js';

// Types -----------------------------------------------------------------------

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

// Constants -------------------------------------------------------------------

/** All colored players required in a complete 4-player game's turn order. */
const FOUR_PLAYER_COLORS: number[] = [p.RED, p.BLUE, p.YELLOW, p.GREEN];

// Functions -------------------------------------------------------------------

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
 *    `checkmate.isCompatible`, whose remaining checks (piece count, slide-line count) only
 *    trip on positions far larger than any this ever sees.
 * 7. Every promotion target is a piece a pawn may actually become — see
 *    {@link gamerules.isValidPromotionPiece}.
 *
 * Types pack into a Uint8Array as `player * numTypes + rawType`, so an out-of-range player
 * wraps to another piece instead of erroring — which is why this runs before anything is built.
 *
 * @param variantOptions - The position and game rules to validate.
 * @param icnString - The position's ICN, used solely to check its length. Provide it in
 * seek-creation contexts; pass `undefined` elsewhere to skip the size check. Both ends measure
 * the exact string that travels, against the same threshold.
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
	if (
		icnString !== undefined &&
		icnString.length > gamelimits.MAX_SERVER_VALIDATABLE_POSITION_LENGTH
	) {
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
	if (gamerules.usesCheckmate(gameRules)) {
		// 3+ players allows one to open a discovered attack and a second to capture the king.
		if (isFourPlayerMode) return 'four_player_checkmate';
		// If any player gets 2+ turns in a row, king capture is possible
		if (moveutil.doesAnyPlayerGet2TurnsInARow(gameRules)) {
			return 'consecutive_turns_with_checkmate';
		}
	}

	// --- Rule 7: Promotion targets are pieces a pawn may become ---
	for (const promotionPiece of gameRules.promotion?.pieces ?? []) {
		if (!gamerules.isValidPromotionPiece(promotionPiece)) return 'invalid_promotion_piece';
	}

	return null; // Position is valid.
}
