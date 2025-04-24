/**
 * This script contains the GameRules interface definition,
 * and contains utility methods for working with them.
 */


import type { Player, RawType, PlayerGroup } from '../util/typeutil.js';


interface GameRules {
    /** An object containing lists of what win conditions each color can win by. */
    winConditions: PlayerGroup<string[]>;
    /** A list of players that make up one full turn cycle. */
    turnOrder: Player[];
    /**
     * Contains a list of all promotion ranks each color promotes at, if they can promote.
     * If neither side can promote, this should be left as undefined.
     */
    promotionRanks?: PlayerGroup<number[]>;
    /**
     * An object containing arrays of raw types white and
	 * black can promote to, if it's legal for them to promote.
     * If one color can't promote, their list should be left undefined.
     */
    promotionsAllowed?: PlayerGroup<RawType[]>;
    /**
     * How many plies (half-moves) can pass with no
	 * captures or pawn pushes until a draw is declared.
	 * Also known as the "50-move rule".
     */
    moveRule?: number;
    /** The maximum number of steps any sliding piece can take. */
    slideLimit?: number;
}


/** Checks if a specified color has a given win condition. */
function doesColorHaveWinCondition(gameRules: GameRules, color: Player, winCondition: string): boolean {
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

	for (const winConditions of Object.values(gameRules.winConditions)) {
		// Remove "checkmate" if it exists
		const indexOf = winConditions.indexOf('checkmate');
		if (indexOf !== -1) {
			winConditions.splice(indexOf, 1); // Remove "checkmate'"
			winConditions.push('royalcapture'); // Add "royalcapture"
		}
	}

	console.log("Swapped checkmate win conditions for royalcapture.");
}


export default {
	doesColorHaveWinCondition,
	getWinConditionCountOfColor,
	swapCheckmateForRoyalCapture,
};

export type {
	GameRules,
};
