// src/shared/chess/util/gamefileutility.ts

/**
 * This script contains many utility methods for working with gamefiles.
 */

import type { Game } from '../logic/fullgame.js';
import type { Board } from '../logic/boardinit.js';
import type { Coords } from './coordutil.js';
import type { Player } from './typeutil.js';
import type { GameruleWinCondition, GameConclusion } from './winconutil.js';

import typeutil from './typeutil.js';
import gamerules from './gamerules.js';
import winconutil from './winconutil.js';
import metadatautil from './metadatautil.js';

// Methods -------------------------------------------------------------

/** Returns true if the game is over. */
function isGameOver(basegame: Game): boolean {
	return basegame.gameConclusion !== undefined;
}

/**
 * Returns true if the currently-viewed position of the game file is in check
 */
function isCurrentViewedPositionInCheck(boardsim: Board): boolean {
	return boardsim.state.local.inCheck !== false;
}

/**
 * Returns a list of coordinates of all royals
 * in check in the currently-viewed position.
 */
function getCheckCoordsOfCurrentViewedPosition(boardsim: Board): Coords[] {
	return boardsim.state.local.inCheck || []; // Return an empty array if we're not in check.
}

/**
 * Sets the conclusion of the game, and sets/clears
 * the `Termination` `Result` and metadata accordingly.
 * If the conclusion is undefined, it removes the metadata,
 * essentially un-concluding the game if it was already concluded.
 */
function setConclusion(basegame: Game, conclusion: GameConclusion | undefined): void {
	basegame.gameConclusion = conclusion;

	if (conclusion !== undefined) {
		basegame.metadata.Termination = winconutil.getTerminationInEnglish(
			basegame.gameRules,
			conclusion.condition,
		);
		basegame.metadata.Result = metadatautil.getResultFromVictor(conclusion.victor);
	} else {
		delete basegame.metadata.Result;
		delete basegame.metadata.Termination;
	}
}

/**
 * Tests if the color's opponent can win from the specified win condition.
 * @param basegame
 * @param friendlyColor - The color of friendlies.
 * @param winCondition - The win condition to check against.
 * @returns True if the opponent can win from the specified win condition, otherwise false.
 */
function isOpponentUsingWinCondition(
	basegame: Game,
	friendlyColor: Player,
	winCondition: GameruleWinCondition,
): boolean {
	const oppositeColor = typeutil.invertPlayer(friendlyColor)!;
	return gamerules.doesColorHaveWinCondition(basegame.gameRules, oppositeColor, winCondition);
}

/** Returns the number of players in the game (unique players in the turnOrder). */
function getPlayerCount(basegame: Game): number {
	return new Set(basegame.gameRules.turnOrder).size;
}

// Exports -------------------------------------------------------------

export default {
	isGameOver,
	isCurrentViewedPositionInCheck,
	getCheckCoordsOfCurrentViewedPosition,
	setConclusion,
	isOpponentUsingWinCondition,
	getPlayerCount,
};
