
"use strict";

/**
 * This script contains lists of compatible win conditions in the game.
 * And contains a few utility methods for them.
 * 
 * ZERO dependancies.
 */

/** Valid win conditions that either color can have. */
const validWinConditions = ['checkmate','royalcapture','allroyalscaptured','allpiecescaptured','threecheck','koth'];

/**
 * List of all win conditions that happen after a move being made.
 * This excludes conclusions such as resignation, time, aborted, disconnect, and agreement.
 * which can happen at any point in time.
 */
const decisiveGameConclusions = [...validWinConditions, 'stalemate', 'repetition', 'moverule', 'insuffmat'];



/**
 * true if the provided win condition is valid for any color to have in the gamerules.
 * This excludes draw conditions, and stuff like time forfeit or resignation.
 * @param {string} winCondition - The win condition
 * @returns {boolean}
 */
function isWinConditionValid(winCondition) {
	return validWinConditions.includes(winCondition);
}

/**
 * Calculates if the provided game conclusion is a decisive conclusion.
 * This is any conclusion that can happen after a move is made.
 * Excludes conclusions like resignation, time, aborted, disconnect, and agreement.
 * which can happen at any point in time.
 * @param {string} gameConclusion - The gameConclusion
 * @returns {boolean} *true* if the gameConclusion is decisive.
 */
function isGameConclusionDecisive(gameConclusion) {
	if (gameConclusion === false) throw new Error('Should not be be testing if game conclusion is decisive when game is not over!');
	const condition = getVictorAndConditionFromGameConclusion(gameConclusion).condition;
	return isConclusionDecisive(condition);
}

/**
 * A variant of {@link isGameConclusionDecisive} with the game conclusion PRE-SPLIT to remove the victor from the first half of it!
 * 
 * Calculates if the provided conclusion is a decisive conclusion.
 * This is any conclusion that can happen after a move is made.
 * Excludes conclusions like resignation, time, aborted, disconnect, and agreement.
 * which can happen at any point in time.
 * @param {string} gameConclusion - The gameConclusion
 * @returns {boolean} *true* if the gameConclusion is decisive.
 */
function isConclusionDecisive(condition) {
	return decisiveGameConclusions.includes(condition);
}

/**
 * Calculates the victor and condition properties from the specified game conclusion.
 * For example, "white checkmate" => `{ victor: 'white', condition: 'checkmate' }`.
 * If the game was aborted, victor will be undefined.
 * @param {string} gameConclusion - The gameConclusion of the gamefile. Examples: 'white checkmate' / 'draw stalemate'  
 * @returns {Object} An object containing 2 properties: `victor` and `condition`
 */
function getVictorAndConditionFromGameConclusion(gameConclusion) {
	if (gameConclusion === false) throw new Error('Should not be getting victor and condition from false gameConclusion! Game is not over.');
	let [victor, condition] = gameConclusion.split(' ');
	if (victor === 'aborted') { // If the conclusion is "aborted", then the victor isn't specified.
		condition = victor;
		victor = undefined;
	}
	return { victor, condition };
}

/**
 * Returns the value of the game's Result metadata, depending on the victor.
 * @param {string} victor - The victor of the game. Can be 'white', 'black', 'draw', or 'aborted'.
 * @returns {string} The result of the game in the format '1-0', '0-1', '0.5-0.5', or '0-0'.
 */
function getResultFromVictor(victor) {
	if (victor === 'white') return '1-0';
	else if (victor === 'black') return '0-1';
	else if (victor === 'draw') return '1/2-1/2';
	else if (victor === undefined) return '0-0';
	throw new Error(`Cannot get game result from strange victor "${victor}"!`);
}

export default {
	isWinConditionValid,
	isGameConclusionDecisive,
	isConclusionDecisive,
	getVictorAndConditionFromGameConclusion,
	getResultFromVictor,
};