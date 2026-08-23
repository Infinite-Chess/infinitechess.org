// src/shared/chess/util/gamefileutility.ts

/**
 * This script contains many utility methods for working with gamefiles.
 */

import type { Board } from '../logic/boardinit.js';
import type { Coords } from '../../util/coordutil.js';
import type { Player } from '../../util/typeutil.js';
import type { GameRules } from './gamerules.js';
import type { GameruleWinCondition, GameConclusion } from './winconutil.js';

import typeutil from '../../util/typeutil.js';
import gamerules from './gamerules.js';

// Methods -------------------------------------------------------------

/**
 * Returns true if the game is over.
 * @param basegame - The minimum properties needed from the gamefile to check if the game is over. MUST PASS IN ACTUAL GAMEFILE, NOT A FAKE.
 */
function isGameOver(basegame: { gameConclusion?: GameConclusion }): boolean {
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
 * Tests if the color's opponent can win from the specified win condition.
 * @param game - The gamefile with the gameRules to check the win condition against.
 * @param friendlyColor - The color of friendlies.
 * @param winCondition - The win condition to check against.
 * @returns True if the opponent can win from the specified win condition, otherwise false.
 */
function isOpponentUsingWinCondition(
	game: { gameRules: GameRules },
	friendlyColor: Player,
	winCondition: GameruleWinCondition,
): boolean {
	const oppositeColor = typeutil.invertPlayer(friendlyColor)!;
	return gamerules.doesColorHaveWinCondition(game.gameRules, oppositeColor, winCondition);
}

/** Returns the number of players in the game (unique players in the turnOrder). */
function getPlayerCount(game: { gameRules: GameRules }): number {
	return new Set(game.gameRules.turnOrder).size;
}

// Exports -------------------------------------------------------------

export default {
	isGameOver,
	isCurrentViewedPositionInCheck,
	getCheckCoordsOfCurrentViewedPosition,
	isOpponentUsingWinCondition,
	getPlayerCount,
};
