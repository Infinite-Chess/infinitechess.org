
/**
 * This script contains many utility methods for working with gamefiles.
 */

import type { Coords } from './coordutil.js';
import type { Player, TypeGroup } from './typeutil.js';
import type { RawType } from './typeutil.js';
import type { PieceMoveset } from '../logic/movesets.js';
// @ts-ignore
import type gamefile from '../logic/gamefile.js';

import boardutil from './boardutil.js';
import typeutil from './typeutil.js';
import moveutil from './moveutil.js';
import metadata from './metadata.js';
import math, { Vec2 } from '../../util/math.js';
// @ts-ignore
import winconutil from './winconutil.js';
// @ts-ignore
import gamerules from '../variants/gamerules.js';
// THIS IS ONLY USED FOR GAME-OVER CHECKMATE TESTS and inflates this files dependancy list!!!
// @ts-ignore
import wincondition from '../logic/wincondition.js'; 


// Methods -------------------------------------------------------------


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
 * Deletes all specialMove functions for pieces that aren't included in this game.
 */
function deleteUnusedSpecialMoves(gamefile: gamefile) {
	const existingRawTypes = gamefile.existingRawTypes;
	for (const key in gamefile.specialMoves) {
		const rawType = Number(key) as RawType;
		if (!existingRawTypes.includes(rawType)) delete gamefile.specialMoves[key];
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

// TODO: This is a GUI only feature that will use Mesh type. MOVE TO ../../GAME WHEN POSSIBLE
/**
 * Gets the bounding box of the game's starting position
 */
function getStartingAreaBox(gamefile: gamefile) {
	if (gamefile.startSnapshot) return gamefile.startSnapshot.box;
	const coordsList = boardutil.getCoordsOfAllPieces(gamefile.pieces);
	return math.getBoxFromCoordsList(coordsList);
}

/**
 * Tests if the provided gamefile has colinear organized lines present in the game.
 * This can occur if there are sliders that can move in the same exact direction as others.
 * For example, [2,0] and [3,0]. We typically like to know this information because
 * we want to avoid having trouble with calculating legal moves surrounding discovered attacks
 * by using royalcapture instead of checkmate.
 * @param pieceMovesets - MUST BE TRIMMED beforehand to not include movesets of types not present in the game!!!!!
 * @param slides - All possible slide directions in the gamefile.
 */
function areColinearSlidesPresentInGame(pieceMovesets: TypeGroup<() => PieceMoveset>, slides: Vec2[]): boolean { // [[1,1], [1,0], ...]

	/**
	 * 1. Colinears are present if any vector is NOT a primitive vector.
	 * 
	 * This is because if a vector is not primitive, multiple simpler vectors can be combined to make it.
	 * For example, [2,0] can be made by combining [1,0] and [1,0].
	 * In a real game, you could have two [2,0] sliders, offset by 1 tile, and their lines would be colinear, yet not intersecting.
	 * 
	 * A vector is considered primitive if the greatest common divisor (GCD) of its components is 1.
	 */

	if (slides!.some((vector: Vec2) => math.GCD(vector[0], vector[1]) !== 1)) return true; // Colinears are present

	/**
	 * 2. Colinears are present if there's at least one custom ignore function.
	 * 
	 * This is because a custom ignore function can be used to simulate a non-primitive vector.
	 * Or another vector for that matter.
	 * We cannot predict if the piece will not cause colinears.
	 */

	if (Object.values(pieceMovesets).some(movesetFunc => {
		const moveset: PieceMoveset = movesetFunc();
		// A custom blocking function may trigger crazy checkmate colinear shenanigans because it can allow opponent pieces to phase through your pieces, so pinning works differently.
		return 'ignore' in moveset || 'blocking' in moveset; // True if this type has a custom ignore/blocking function being used (colinears may be present).
		
	})) return true; // Colinears are present

	return false; // Colinears are not present
}

function getPlayerCount(gamefile: gamefile) {
	if (gamefile.startSnapshot) return gamefile.startSnapshot.playerCount;
	return new Set(gamefile.gameRules.turnOrder).size;
}

// ---------------------------------------------------------------------------------------------------------------------!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!


export default {
	isGameOver,
	isCurrentViewedPositionInCheck,
	getCheckCoordsOfCurrentViewedPosition,
	setTerminationMetadata,
	eraseTerminationMetadata,
	isOpponentUsingWinCondition,
	deleteUnusedSpecialMoves,
	doGameOverChecks,
	getStartingAreaBox,
	getPlayerCount,
	areColinearSlidesPresentInGame,
};
