// src/shared/chess/util/gamefileutility.ts

/**
 * This script contains many utility methods for working with gamefiles.
 */

import type { Coords } from './coordutil.js';
import type { Player } from './typeutil.js';
import type { Game, Board, FullGame } from '../logic/gamefile.js';

import typeutil from './typeutil.js';
import moveutil from './moveutil.js';
import metadata from './metadata.js';
import gamerules from '../variants/gamerules.js';
import winconutil from './winconutil.js';
import wincondition from '../logic/wincondition.js'; // THIS IS ONLY USED FOR GAME-OVER CHECKMATE TESTS and inflates this files dependancy list!!!

// Methods -------------------------------------------------------------

/**
 * Returns true if the game is over (gameConclusion is truthy).
 * If the game is over, it will be a string. If not, it will be false.
 */
function isGameOver(basegame: Game): boolean {
	if (basegame.gameConclusion) return true;
	return false;
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
 * Sets the `Termination` and `Result` metadata of the gamefile, according to the game conclusion.
 */
function setTerminationMetadata(basegame: Game): void {
	if (!basegame.gameConclusion)
		return console.error("Cannot set conclusion metadata when game isn't over yet.");

	const victorAndCondition: { victor?: Player; condition: string } =
		winconutil.getVictorAndConditionFromGameConclusion(basegame.gameConclusion);
	const conditionInPlainEnglish: string = winconutil.getTerminationInEnglish(
		basegame.gameRules,
		victorAndCondition.condition,
	);
	basegame.metadata.Termination = conditionInPlainEnglish;

	basegame.metadata.Result = metadata.getResultFromVictor(victorAndCondition.victor); // white/black/draw/undefined
}

/**
 * Deletes the `Termination` and `Result` metadata from the gamefile.
 */
function eraseTerminationMetadata(basegame: Game): void {
	delete basegame.metadata.Termination;
	delete basegame.metadata.Result;
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
	winCondition: string,
): boolean {
	if (!winconutil.isWinConditionValid(winCondition))
		throw new Error(
			`Cannot test if opponent of color "${friendlyColor}" is using invalid win condition "${winCondition}"!`,
		);
	const oppositeColor = typeutil.invertPlayer(friendlyColor)!;
	return gamerules.doesColorHaveWinCondition(basegame.gameRules, oppositeColor, winCondition);
}

// FUNCTIONS THAT SHOULD BE MOVED ELSEWHERE!!!!! They introduce too many dependancies ----------------------------------!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

/**
 * Tests if the game is over by the used win condition, and if so, sets the `gameConclusion` property according to how the game was terminated.
 */
function doGameOverChecks(gamefile: FullGame): void {
	gamefile.basegame.gameConclusion = wincondition.getGameConclusion(gamefile);
	if (
		isGameOver(gamefile.basegame) &&
		winconutil.isGameConclusionDecisive(gamefile.basegame.gameConclusion)
	)
		moveutil.flagLastMoveAsMate(gamefile.boardsim);
}

/** Returns the number of players in the game (unique players in the turnOrder). */
function getPlayerCount(basegame: Game): number {
	return new Set(basegame.gameRules.turnOrder).size;
}

/** Calculates the unique players in the turn order, in the order they appear. */
function getUniquePlayersInTurnOrder(turnOrder: Player[]): Player[] {
	// Using a Set removes duplicates before converting to an array
	return [...new Set(turnOrder)];
}

// ---------------------------------------------------------------------------------------------------------------------!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

export default {
	isGameOver,
	isCurrentViewedPositionInCheck,
	getCheckCoordsOfCurrentViewedPosition,
	setTerminationMetadata,
	eraseTerminationMetadata,
	isOpponentUsingWinCondition,
	doGameOverChecks,
	getPlayerCount,
	getUniquePlayersInTurnOrder,
};
