// src/shared/chess/variants/positionvalidation.ts

/**
 * This script provides shared semantic validation of a VariantOptions object.
 *
 * It checks whether a position is playable: that player IDs are within supported
 * range, that the mode is pure 2-player or pure 4-player, that all required players
 * are in the turn order, that piece colors are consistent with the turn order,
 * that neutral gargoyles aren't present in 2-player mode, that every player has at
 * least one piece, that the ICN string isn't too long for server transfer, and
 * that players using royal-dependent win conditions have a royal piece on the board.
 */

import type { RawType } from '../util/typeutil.js';
import type { MetaData } from '../../types.js';
import type { VariantOptions, FullGame } from '../logic/fullgame.js';

import gamerules from '../util/gamerules.js';
import boardinit from '../logic/boardinit.js';
import checkdetection from '../logic/checkdetection.js';
import { POSITION_STRING_THRESHOLD } from './servervalidation.js';
import typeutil, { neutralRawTypes, players } from '../util/typeutil.js';

// Constants -------------------------------------------------------------------------

/**
 * Win conditions that require a player to have at least one royal piece on the board.
 * If a player uses one of these but has no royal, the position is illegal.
 */
const WIN_CONDITIONS_REQUIRING_ROYAL: string[] = ['checkmate', 'royalcapture', 'allroyalscaptured'];

/** All colored players required in a complete 4-player game's turn order. */
const FOUR_PLAYER_COLORS = [players.RED, players.BLUE, players.YELLOW, players.GREEN] as const;

// Functions -------------------------------------------------------------------------

/**
 * Validates a VariantOptions object for semantic legality.
 *
 * Checks (in order):
 * 1. No player IDs above GREEN (6) in the turn order or piece colors.
 * 2. White/black and colored (4-player) players in the turn order are mutually exclusive.
 * 3. Mode completeness: 2-player needs both white+black; 4-player needs all 4 colored players.
 * 4. ICN string length does not exceed {@link POSITION_STRING_THRESHOLD}.
 * 5. Every non-neutral piece's color is in the turn order.
 *    In 2-player mode, no neutral gargoyle pieces are allowed.
 *    Tracks which players have pieces and which have royal pieces (single iteration).
 * 6. Every player in the turn order has at least one piece and, if required, a royal piece.
 *
 * @param variantOptions - The position and game rules to validate.
 * @param icnString - The ICN string representation of the position, used to check its length.
 * @returns `null` if valid, or a string describing the reason the position is illegal.
 */
function validatePosition(variantOptions: VariantOptions, icnString: string): string | null {
	const { position, gameRules } = variantOptions;
	const uniquePlayers = gamerules.getUniquePlayersInTurnOrder(gameRules.turnOrder);
	const turnOrderSet = new Set<number>(uniquePlayers);

	// --- Rule 1: No player IDs above GREEN (6) in the turn order ---
	for (const player of uniquePlayers) {
		if (player > players.GREEN) {
			return `Turn order contains invalid player ID ${player}. Only player IDs up to ${players.GREEN} (${typeutil.strcolors[players.GREEN]}) are supported.`;
		}
	}

	// --- Rule 2: Mode mutual exclusivity (white/black vs colored) ---
	const hasColoredPlayers = uniquePlayers.some((p) => p >= players.RED);
	const hasTwoPlayerColors = uniquePlayers.some(
		(p) => p === players.WHITE || p === players.BLACK,
	);
	if (hasColoredPlayers && hasTwoPlayerColors) {
		return 'The turn order contains both 2-player (white/black) and colored (4-player) players. These are mutually exclusive.';
	}

	const isFourPlayerMode = hasColoredPlayers;

	// --- Rule 3: Mode completeness ---
	if (isFourPlayerMode) {
		for (const p of FOUR_PLAYER_COLORS) {
			if (!turnOrderSet.has(p)) {
				return `4-player mode requires all four colored players in the turn order, but '${typeutil.strcolors[p]}' is missing.`;
			}
		}
	} else {
		if (!turnOrderSet.has(players.WHITE)) {
			return "2-player mode requires both white and black in the turn order, but 'white' is missing.";
		}
		if (!turnOrderSet.has(players.BLACK)) {
			return "2-player mode requires both white and black in the turn order, but 'black' is missing.";
		}
	}

	// --- Rule 4: ICN string length limit ---
	if (icnString.length > POSITION_STRING_THRESHOLD) {
		return `The ICN position string is ${icnString.length} characters long, exceeding the maximum of ${POSITION_STRING_THRESHOLD}.`;
	}

	// --- Rules 5 & 6 setup: single iteration over all pieces ---
	const neutralExemptRawTypes = new Set<RawType>(neutralRawTypes); // void and obstacle
	const royalRawTypes = new Set<RawType>(typeutil.royals);
	const playersWithPieces = new Set<number>();
	const playersWithRoyals = new Set<number>();

	for (const pieceType of position.values()) {
		const [rawType, color] = typeutil.splitType(pieceType);

		if (color === players.NEUTRAL) {
			// In 2-player mode, only void and obstacle neutrals are allowed; no gargoyles.
			if (!isFourPlayerMode && !neutralExemptRawTypes.has(rawType)) {
				return `Position contains a neutral ${typeutil.getRawTypeStr(rawType)} piece (a gargoyle), which is only valid in 4-player games.`;
			}
		} else {
			// Reject pieces with invalid player IDs (> GREEN).
			if (color > players.GREEN) {
				return `Position contains a piece with invalid player ID ${color}. Only player IDs up to ${players.GREEN} are supported.`;
			}
			// Non-neutral piece colors must be in the turn order.
			if (!turnOrderSet.has(color)) {
				return `Position contains a ${typeutil.strcolors[color]} piece but '${typeutil.strcolors[color]}' is not in the turn order.`;
			}
			playersWithPieces.add(color);
			if (royalRawTypes.has(rawType)) playersWithRoyals.add(color);
		}
	}

	// --- Rule 6: Per-player post-checks ---
	for (const player of uniquePlayers) {
		if (!playersWithPieces.has(player)) {
			return `Player '${typeutil.strcolors[player]}' is in the turn order but has no pieces on the board.`;
		}
		const playerWinCons = gameRules.winConditions[player] ?? [];
		const winConsRequiringRoyal = playerWinCons.filter((wc) =>
			WIN_CONDITIONS_REQUIRING_ROYAL.includes(wc),
		);
		if (winConsRequiringRoyal.length > 0 && !playersWithRoyals.has(player)) {
			return `Player '${typeutil.strcolors[player]}' uses win condition '${winConsRequiringRoyal.join(', ')}' but has no royal piece on the board.`;
		}
	}

	// --- Rule 7: 2nd player must not be in check on turn 1 (checkmate games only) ---
	// If they are, the 1st player can capture their royal piece immediately — in checkmate mode
	// this doesn't end the game (no win condition fires), creating an illegal "limbo" state.
	const checkmateUsed = uniquePlayers.some((player) =>
		(gameRules.winConditions[player] ?? []).includes('checkmate'),
	);
	if (checkmateUsed) {
		const secondPlayer = gameRules.turnOrder[1];
		if (secondPlayer !== undefined) {
			const boardsim = boardinit.initBoard(gameRules, undefined, 0, variantOptions);
			const fakeFullGame: FullGame = {
				basegame: {
					metadata: {} as MetaData,
					dateTimestamp: 0,
					moves: [],
					whosTurn: boardsim.whosTurn,
					untimed: true,
					clocks: undefined,
				},
				boardsim,
			};
			const checkResult = checkdetection.detectCheck(fakeFullGame, secondPlayer, false);
			if (checkResult.check) {
				return `Illegal position: The 2nd player to move ('${typeutil.strcolors[secondPlayer]}') is already in check on turn 1, allowing the 1st player to immediately capture their royal piece.`;
			}
		}
	}

	return null; // Position is valid.
}

export default { validatePosition };
