
/**
 * This script contains the gameRules constructor,
 * and contains utility methods for working with them.
 */

import jsutil from "../../util/jsutil.js";
import { players } from "../util/typeutil.js";

/**
 * @typedef {import('../util/typeutil.js').Player} Player
 * @typedef {import('../util/typeutil.js').RawType} RawType
 * @typedef {import("../util/typeutil.js").PlayerGroup} PlayerGroup
 */


/**
 * Checks if a specified color has a given win condition.
 * @param {GameRules} gameRules
 * @param {Player} color - The player color to check (e.g., 1, 2).
 * @param {string} winCondition - The win condition for.
 * @returns {boolean} True if the specified color has the given win condition, otherwise false.
 */
function doesColorHaveWinCondition(gameRules, color, winCondition) {
	return gameRules.winConditions[color].includes(winCondition);
}

/**
 * Gets the count of win conditions for a specified color in the gamefile.
 * @param {GameRules} gameRules
 * @param {Player} color - The player color to check (e.g., 1, 2).
 * @returns {number} The number of win conditions for the specified color. Returns 0 if the color is not defined.
 */
function getWinConditionCountOfColor(gameRules, color) {
	if (!gameRules.winConditions[color]) return 0; // Color not defined.
	return gameRules.winConditions[color].length;
}

/**
 * Swaps the "checkmate" win condition for "royalcapture" in the gameRules if applicable.
 * @param {GameRules} gameRules
 */
function swapCheckmateForRoyalCapture(gameRules) {
	// Check if the game is using the "royalcapture" win condition
	if (doesColorHaveWinCondition(gameRules, players.WHITE, 'checkmate')) {
		jsutil.removeObjectFromArray(gameRules.winConditions[players.WHITE], 'checkmate');
		gameRules.winConditions[players.WHITE].push('royalcapture');
	}
	if (doesColorHaveWinCondition(gameRules, players.BLACK, 'checkmate')) {
		jsutil.removeObjectFromArray(gameRules.winConditions[players.BLACK], 'checkmate');
		gameRules.winConditions[players.BLACK].push('royalcapture');
	}
	console.log("Swapped checkmate wincondition for royalcapture.");
}

/** An object containing the gamerules of a gamefile. */
function GameRules() {
	console.error("This GameRules constructor should NEVER be called! It is purely for JSDoc dropdown info.");

	// REQUIRED gamerules...

	/** An object containing lists of what win conditions each color can win by. This is REQUIRED.
	 * @type {PlayerGroup<string[]>}
	 */
	this.winConditions = undefined;
	/** A list of players that make up one full turn cycle. REQUIRED. @type {Player[]} */
	this.turnOrder = undefined;

	// Gamerules that also have dedicated slots in ICN notation...

	/**
     * Contains a list of all promotion ranks each color promotes at, if they can promote.
     * If neither side can promote, this should be left as undefined.
     * @type {PlayerGroup<number[]> | undefined}
     */
	this.promotionRanks = undefined;
	/**
     * An object containing arrays of types white and black can promote to, if it's legal for them to promote.
     * If one color can't promote, their list should be left undefined.
     * If no color can promote, this should be left undefined.
	 * @type {PlayerGroup<RawType[]> | undefined}
     */
	this.promotionsAllowed = undefined;
	/** How many plies (half-moves) can pass with no captures or pawn pushes until a draw is declared. @type {number | undefined} */
	this.moveRule = undefined;

	// Gamerules that DON'T have a dedicated slot in ICN notation...

	/** The maximum number of steps any sliding piece can take. @type {number | undefined} */
	this.slideLimit = undefined;
}



export default {
	doesColorHaveWinCondition,
	getWinConditionCountOfColor,
	swapCheckmateForRoyalCapture,
};
// Type export DO NOT USE
export { GameRules };