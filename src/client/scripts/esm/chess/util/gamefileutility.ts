
/**
 * This script contains many utility methods for working with gamefiles.
 */

import type { Coords } from './coordutil.js';
import type { Player } from './typeutil.js';
import type { RawType } from './typeutil.js';
// @ts-ignore
import type gamefile from '../logic/gamefile.js';

import boardutil from './boardutil.js';
import typeutil from './typeutil.js';
// @ts-ignore
import winconutil from './winconutil.js';
// @ts-ignore
import gamerules from '../variants/gamerules.js';
import moveutil from './moveutil.js';
import metadata from './metadata.js';
import math from '../../util/math.js';
// THIS IS ONLY USED FOR GAME-OVER CHECKMATE TESTS and inflates this files dependancy list!!!
// @ts-ignore
import wincondition from '../logic/wincondition.js'; 
// Import End

/**
 * Returns true if the game is over (gameConclusion is truthy).
 * If the game is over, it will be a string. If not, it will be false.
 * @param gamefile - The gamefile.
 * @returns true if over
 */
function isGameOver(gamefile: gamefile): boolean {
	if (gamefile.gameConclusion) return true;
	return false;
}

/**
 * Returns true if the currently-viewed position of the game file is in check
 */
function isCurrentViewedPositionInCheck(gamefile: gamefile): boolean {
	return gamefile.inCheck !== false;
}

/**
 * Returns a list of coordinates of all royals
 * in check in the currently-viewed position.
 */
function getCheckCoordsOfCurrentViewedPosition(gamefile: gamefile): Coords[] {
	return gamefile.inCheck || []; // Return an empty array if we're not in check.
}

/**
 * Sets the `Termination` and `Result` metadata of the gamefile, according to the game conclusion.
 */
function setTerminationMetadata(gamefile: gamefile) {
	if (!gamefile.gameConclusion) return console.error("Cannot set conclusion metadata when game isn't over yet.");

	const victorAndCondition: { victor?: Player, condition: string } = winconutil.getVictorAndConditionFromGameConclusion(gamefile.gameConclusion);
	const conditionInPlainEnglish: string = winconutil.getTerminationInEnglish(gamefile, victorAndCondition.condition);
	gamefile.metadata.Termination = conditionInPlainEnglish;

	gamefile.metadata.Result = metadata.getResultFromVictor(victorAndCondition.victor); // white/black/draw/undefined
}

/**
 * Deletes the `Termination` and `Result` metadata from the gamefile.
 */
function eraseTerminationMetadata(gamefile: gamefile) {
	delete gamefile.metadata.Termination;
	delete gamefile.metadata.Result;
}

/**
 * Tests if the color's opponent can win from the specified win condition.
 * @param gamefile - The gamefile.
 * @param friendlyColor - The color of friendlies.
 * @param winCondition - The win condition to check against.
 * @returns True if the opponent can win from the specified win condition, otherwise false.
 */
function isOpponentUsingWinCondition(gamefile: gamefile, friendlyColor: Player, winCondition: string): boolean {
	if (!winconutil.isWinConditionValid(winCondition)) throw new Error(`Cannot test if opponent of color "${friendlyColor}" is using invalid win condition "${winCondition}"!`);
	const oppositeColor = typeutil.invertPlayer(friendlyColor)!;
	return gamerules.doesColorHaveWinCondition(gamefile.gameRules, oppositeColor, winCondition);
}

/**
 * Deletes all movesets from a Movesets object for pieces
 * that aren't included in this game.
 */
function deleteUnusedMovesets(gamefile: gamefile) {
	const existingRawTypes = gamefile.startSnapshot.existingRawTypes;
	for (const key in gamefile.pieceMovesets) {
		const rawType = Number(key) as RawType;
		if (!existingRawTypes.includes(rawType)) delete gamefile.pieceMovesets[key];
	}
}

// FUNCTIONS THAT SHOULD BE MOVED ELSEWHERE!!!!! They introduce too many dependancies ----------------------------------!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

/**
 * Tests if the game is over by the used win condition, and if so, sets the `gameConclusion` property according to how the game was terminated.
 */
function doGameOverChecks(gamefile: gamefile) {
	gamefile.gameConclusion = wincondition.getGameConclusion(gamefile);
	if (isGameOver(gamefile) && winconutil.isGameConclusionDecisive(gamefile.gameConclusion)) moveutil.flagLastMoveAsMate(gamefile);
}

// TODO: This is a GUI only feature that will use Mesh type. MOVE TO GAME WHEN POSSIBLE
/**
 * Saves the bounding box of the game's starting position to the startSnapshot property
 */
function initStartingAreaBox(gamefile: gamefile) {
	const coordsList = boardutil.getCoordsOfAllPieces(gamefile.ourPieces);
	const box = math.getBoxFromCoordsList(coordsList);
	gamefile.startSnapshot.box = box;
}
// ---------------------------------------------------------------------------------------------------------------------!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

export default {
	isGameOver,
	isCurrentViewedPositionInCheck,
	getCheckCoordsOfCurrentViewedPosition,
	setTerminationMetadata,
	eraseTerminationMetadata,
	isOpponentUsingWinCondition,
	deleteUnusedMovesets,
	doGameOverChecks,
	initStartingAreaBox,
};
