// src/shared/chess/variants/positionvalidation.ts

/**
 * This script provides validation of a VariantOptions object and ICN.
 * No illegal positions, nor excessively large games, are allowed.
 */

import type { RawType } from '../util/typeutil.js';
import type { VariantOptions } from '../logic/gamefile.js';

import bounds from '../../util/math/bounds.js';
import moveutil from '../util/moveutil.js';
import gamerules from '../util/gamerules.js';
import coordutil from '../util/coordutil.js';
import boardinit from '../logic/boardinit.js';
import winconutil from '../util/winconutil.js';
import checkdetection from '../logic/checkdetection.js';
import { POSITION_STRING_THRESHOLD } from './servervalidation.js';
import typeutil, { neutralRawTypes, players as p } from '../util/typeutil.js';

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
	| 'player_missing_pieces'
	| 'consecutive_turns_with_checkmate'
	| 'too_many_royals_for_checkmate'
	| 'king_capture_on_turn_1';

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
 * 6. Every player in the turn order has at least one piece.
 * 7. Checkmate incompatibility: No player gets consecutive turns; royal count
 *    is not too high; and king capture is not possible on turn 1.
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
	if (icnString !== undefined && icnString.length > POSITION_STRING_THRESHOLD) {
		return 'position_too_large';
	}

	// --- Rules 4 & 5: World border containment, piece color and turn order consistency ---
	const neutralExemptRawTypes = new Set<RawType>(neutralRawTypes); // void and obstacle
	const royalRawTypes = new Set<RawType>(typeutil.royals);
	const playersWithPieces = new Set<number>();
	const worldBorder = gameRules.worldBorder;
	let royalCount = 0;

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
			playersWithPieces.add(color);
			if (royalRawTypes.has(rawType)) royalCount++;
		}
	}

	// --- Rule 6: Every player has at least one piece ---
	// A player with no royal is legal, even under a royal-requiring win
	// condition — they simply can't win (e.g. a practice checkmate played PvP).
	for (const player of uniquePlayers) {
		if (!playersWithPieces.has(player)) return 'player_missing_pieces';
	}

	// --- Rule 7: Checkmate incompatibility ---
	const checkmateUsed = uniquePlayers.some((player) =>
		(gameRules.winConditions[player] ?? []).includes('checkmate'),
	);
	if (checkmateUsed) {
		// In 2-player mode, if any player gets 2+ turns in a row, king capture is possible
		if (!isFourPlayerMode && moveutil.doesAnyPlayerGet2TurnsInARow(gameRules)) {
			return 'consecutive_turns_with_checkmate';
		}
		if (royalCount > winconutil.royalCountToDisableCheckmate) {
			return 'too_many_royals_for_checkmate';
		}
		// King capture must not be possible on turn 1
		const secondPlayer = gameRules.turnOrder[1]!;
		const boardsim = boardinit.initBoard(gameRules, undefined, { variantOptions });
		const checkResult = checkdetection.detectCheck(boardsim, secondPlayer, false);
		if (checkResult.check) {
			return 'king_capture_on_turn_1';
		}
	}

	return null; // Position is valid.
}
