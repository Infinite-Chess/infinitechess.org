// src/shared/chess/variants/positionvalidation.ts

/**
 * This script provides validation of a VariantOptions object and ICN.
 * No illegal positions, nor excessively large games, are allowed.
 */

import type { RawType } from '../util/typeutil.js';
import type { VariantOptions } from '../logic/gamefile.js';
import type { GameruleWinCondition } from '../util/winconutil.js';

import moveutil from '../util/moveutil.js';
import gamerules from '../util/gamerules.js';
import boardinit from '../logic/boardinit.js';
import winconutil from '../util/winconutil.js';
import checkdetection from '../logic/checkdetection.js';
import { POSITION_STRING_THRESHOLD } from './servervalidation.js';
import typeutil, { neutralRawTypes, players as p } from '../util/typeutil.js';

// Constants -------------------------------------------------------------------------

/**
 * Win conditions that require a player to have at least one royal piece on the board.
 * If a player uses one of these but has no royal, the position is illegal.
 */
const WIN_CONDITIONS_REQUIRING_ROYAL: string[] = [
	'checkmate',
	'royalcapture',
	'allroyalscaptured',
	'koth',
] satisfies GameruleWinCondition[];

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
	| 'gargoyles_not_allowed'
	| 'invalid_player_id'
	| 'player_missing_pieces'
	| 'player_missing_royal'
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
 * 3. ICN string length is not too large.
 * 4. Every non-neutral piece's color is in the turn order.
 *    In 2-player mode, no neutral gargoyle pieces are allowed.
 * 5. Every player in the turn order has at least one piece and, if required, a royal piece.
 * 6. Checkmate incompatibility: No player gets consecutive turns; royal count
 *    is not too high; and king capture is not possible on turn 1.
 *
 * @param variantOptions - The position and game rules to validate.
 * @param icnString - The ICN string representation of the position, used to check its length.
 * @returns `null` if valid, or a {@link PositionErrorCode} describing the failure.
 */
export function validatePosition(
	variantOptions: VariantOptions,
	icnString: string,
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

	// --- Rule 3: ICN string length limit ---
	if (icnString.length > POSITION_STRING_THRESHOLD) {
		return 'position_too_large';
	}

	// --- Rule 4: Piece color and turn order consistency ---
	const neutralExemptRawTypes = new Set<RawType>(neutralRawTypes); // void and obstacle
	const royalRawTypes = new Set<RawType>(typeutil.royals);
	const playersWithPieces = new Set<number>();
	const playersWithRoyals = new Set<number>();
	let royalCount = 0;

	for (const pieceType of position.values()) {
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
			if (royalRawTypes.has(rawType)) {
				playersWithRoyals.add(color);
				royalCount++;
			}
		}
	}

	// --- Rule 5: Per-player post-checks ---
	for (const player of uniquePlayers) {
		if (!playersWithPieces.has(player)) {
			return 'player_missing_pieces';
		}
		const playerWinCons = gameRules.winConditions[player] ?? [];
		const playerRequiresRoyal = playerWinCons.some((wc) =>
			WIN_CONDITIONS_REQUIRING_ROYAL.includes(wc),
		);
		if (playerRequiresRoyal && !playersWithRoyals.has(player)) {
			return 'player_missing_royal';
		}
	}

	// --- Rule 6: Checkmate incompatibility ---
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
		const boardsim = boardinit.initBoard(gameRules, undefined, variantOptions);
		const checkResult = checkdetection.detectCheck(boardsim, secondPlayer, false);
		if (checkResult.check) {
			return 'king_capture_on_turn_1';
		}
	}

	return null; // Position is valid.
}
