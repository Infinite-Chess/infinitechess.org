
/**
 * This script contains many utility methods for working with gamefiles.
 */

import type { Coords } from './coordutil.js';
import type { Player, RawTypeGroup } from './typeutil.js';
import type { PieceMoveset } from '../logic/movesets.js';
import type { Game, Board, FullGame } from '../logic/gamefile.js';

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
function setTerminationMetadata(basegame: Game) {
	if (!basegame.gameConclusion) return console.error("Cannot set conclusion metadata when game isn't over yet.");

	const victorAndCondition: { victor?: Player, condition: string } = winconutil.getVictorAndConditionFromGameConclusion(basegame.gameConclusion);
	const conditionInPlainEnglish: string = winconutil.getTerminationInEnglish(basegame.gameRules, victorAndCondition.condition);
	basegame.metadata.Termination = conditionInPlainEnglish;

	basegame.metadata.Result = metadata.getResultFromVictor(victorAndCondition.victor); // white/black/draw/undefined
}

/**
 * Deletes the `Termination` and `Result` metadata from the gamefile.
 */
function eraseTerminationMetadata(basegame: Game) {
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
function isOpponentUsingWinCondition(basegame: Game, friendlyColor: Player, winCondition: string): boolean {
	if (!winconutil.isWinConditionValid(winCondition)) throw new Error(`Cannot test if opponent of color "${friendlyColor}" is using invalid win condition "${winCondition}"!`);
	const oppositeColor = typeutil.invertPlayer(friendlyColor)!;
	return gamerules.doesColorHaveWinCondition(basegame.gameRules, oppositeColor, winCondition);
}

// FUNCTIONS THAT SHOULD BE MOVED ELSEWHERE!!!!! They introduce too many dependancies ----------------------------------!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

/**
 * Tests if the game is over by the used win condition, and if so, sets the `gameConclusion` property according to how the game was terminated.
 */
function doGameOverChecks(gamefile: FullGame) {
	gamefile.basegame.gameConclusion = wincondition.getGameConclusion(gamefile);
	if (isGameOver(gamefile.basegame) && winconutil.isGameConclusionDecisive(gamefile.basegame.gameConclusion)) moveutil.flagLastMoveAsMate(gamefile.boardsim);
}

/**
 * Gets the bounding box of the game's starting position
 */
function getStartingAreaBox(boardsim: Board) {
	if (boardsim.startSnapshot?.box) return boardsim.startSnapshot.box;
	const coordsList = boardutil.getCoordsOfAllPieces(boardsim.pieces);
	if (coordsList.length === 0) coordsList.push([1,1], [8,8]); // use the [1,1]-[8,8] area as a fallback
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
function areColinearSlidesPresentInGame(pieceMovesets: RawTypeGroup<() => PieceMoveset>, slides: Vec2[]): boolean { // [[1,1], [1,0], ...]

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

/** Returns the number of players in the game (unique players in the turnOrder). */
function getPlayerCount(basegame: Game) {
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
	getStartingAreaBox,
	getPlayerCount,
	getUniquePlayersInTurnOrder,
	areColinearSlidesPresentInGame,
};
