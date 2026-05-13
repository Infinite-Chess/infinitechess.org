// src/shared/chess/util/gamerules.ts

/**
 * This script contains the GameRules interface definition,
 * and contains utility methods for working with them.
 */

import type { UnboundedRectangle } from '../../util/math/bounds.js';
import type { GameruleWinCondition } from './winconutil.js';
import type { Player, RawType, PlayerGroup } from './typeutil.js';

export interface GameRules {
	/** An object containing lists of what win conditions each color can win by. */
	winConditions: PlayerGroup<GameruleWinCondition[]>;
	/** A list of players that make up one full turn cycle. */
	turnOrder: Player[];
	/** The promotion pieces & ranks, if this game allows promotion. */
	promotion?: Promotion;
	/**
	 * How many plies (half-moves) can pass with no
	 * captures or pawn pushes until a draw is declared.
	 * Also known as the "50-move rule".
	 */
	moveRule?: number;
	/** The maximum number of steps any sliding piece can take. */
	slideLimit?: bigint;
	/**
	 * IF a world border is present, this is a bounding box
	 * containing all integer coordinates that are inside the
	 * playing area, not on or outside the world border.
	 * All pieces must be within this box.
	 * The inclusive playable region of the board.
	 */
	worldBorder?: UnboundedRectangle;
}

export type Promotion = {
	/** Contains a list of all promotion ranks each color promotes at. */
	ranks: PlayerGroup<bigint[]>;
	/** A shared list of raw piece types any player can promote to. */
	pieces: RawType[];
};

/** Checks if a specified color has a given win condition. */
function doesColorHaveWinCondition(
	gameRules: GameRules,
	color: Player,
	winCondition: GameruleWinCondition,
): boolean {
	return !!gameRules.winConditions[color]?.includes(winCondition);
	// The `!!` converts the result (true/false/undefined) strictly to boolean (true/false).
}

/** Gets the count of win conditions for a specified color in the game rules. */
function getWinConditionCountOfColor(gameRules: GameRules, player: Player): number {
	return gameRules.winConditions[player]?.length ?? 0;
}

/**
 * Swaps the "checkmate" win condition for "royalcapture" in the gameRules if applicable.
 * Modifies the gameRules object in place.
 */
function swapCheckmateForRoyalCapture(gameRules: GameRules): void {
	let changeMade = false;
	for (const winConditions of Object.values(gameRules.winConditions)) {
		// Remove "checkmate" if it exists
		const indexOf = winConditions.indexOf('checkmate');
		if (indexOf !== -1) {
			winConditions.splice(indexOf, 1); // Remove "checkmate'"
			winConditions.push('royalcapture'); // Add "royalcapture"
			changeMade = true;
		}
	}

	if (changeMade) console.log('Swapped checkmate win conditions for royalcapture.');
}

/**
 * Returns a list of all unique players in the turn order.
 * Removes duplicates while preserving the order of first appearance.
 * @param turnOrder - The turn order array that may contain duplicate players
 */
function getUniquePlayersInTurnOrder(turnOrder: Player[]): Player[] {
	return [...new Set(turnOrder)];
}

export default {
	doesColorHaveWinCondition,
	getWinConditionCountOfColor,
	swapCheckmateForRoyalCapture,
	getUniquePlayersInTurnOrder,
};
