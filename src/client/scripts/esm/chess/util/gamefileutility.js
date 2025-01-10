
/**
 * This script contains many utility methods for working with gamefiles.
 */

"use strict";

// Import Start
// THIS IS ONLY USED FOR GAME-OVER CHECKMATE TESTS and inflates this files dependancy list!!!
import wincondition from '../logic/wincondition.js'; 
// Healthy dependancies below
import colorutil from './colorutil.js';
import typeutil from './typeutil.js';
import jsutil from '../../util/jsutil.js';
import coordutil from './coordutil.js';
import winconutil from './winconutil.js';
import gamerules from '../variants/gamerules.js';
import metadata from './metadata.js';
// Import End


// Type Definitions -----------------------------------------------------------------------------------------------


/** 
 * Type Definitions 
 * @typedef {import('../logic/gamefile.js').gamefile} gamefile
 * @typedef {import('../logic/boardchanges.js').Piece} Piece
*/


// Variables -----------------------------------------------------------------------------------------------


/** The maximum number of pieces in-game to still use the checkmate algorithm. Above this uses "royalcapture". */
const pieceCountToDisableCheckmate = 50_000;


// Iterating Through All Pieces -----------------------------------------------------------------------------------------------


/**
 * Iterates through EVERY piece in the game state, and performs specified function on the piece.
 * @param {*} gamefile 
 * @param {Function} callback - (type, coords, gamefile) => {}
 * @param {boolean} ignoreVoids - If true, we won't run the callback for voids
 */
function forEachPieceInGame(gamefile, callback) {
	if (!gamefile) return console.log("Cannot iterate through each piece in an undefined game!");
	if (!gamefile.ourPieces) return console.error("Cannot iterate through every piece of game when there's no piece list.");
	const ignoreVoids = false;
	forEachPieceInPiecesByType(callback, gamefile.ourPieces, ignoreVoids, gamefile);
}

/**
 * Iterates through each piece in a `piecesByType` list and executes the specified callback function.
 * Skips over undefined placeholders in the list.
 * @param {Function} callback - (type, coords, gamefile) => {}
 * @param {number[][]} typeList - A list of pieces organized by type.
 * @param {boolean} ignoreVoids - If true, skips piece types starting with "voids".
 * @param {Object} gamefile
 */
function forEachPieceInPiecesByType(callback, typeList, ignoreVoids, gamefile) { // typeList = pieces organized by type 
	if (!typeList) return console.log("Cannot iterate through each piece in an undefined typeList!");
	for (const type in typeList) {
		if (ignoreVoids && type.startsWith('voids')) continue;
		const thisTypeList = typeList[type];
		for (const thisPieceCoords of thisTypeList) {
			if (thisPieceCoords === undefined) continue; // An undefined placeholder
			callback(type, thisPieceCoords, gamefile); 
		}
	}
}

/**
 * Iterates through each piece's coords in a type list and executes the specified callback function on it.
 * Skips over undefined placeholders.
 * @param {Function} callback - (type, coords) => {}
 * @param {number[]} typeList - A list of piece coordinates of a specific type, that MAY include undefined placeholders.
 */
function forEachPieceInTypeList(callback, typeList) { // typeList = pieces organized by type 
	for (const coords of typeList) {
		if (coords === undefined) continue; // An undefined placeholder
		callback(coords); 
	}
}

/**
 * Iterates through each piece in the provided keys-state and executes a callback function.
 * @param {Function} callback - The callback function to execute for each piece: `(type, coords) => {}`
 * @param {Object} state - The keys-state object containing pieces organized by key.
 * @param {Object} [options] - Optional settings.
 * @param {boolean} [options.ignoreNeutrals] - If true, neutral pieces (those with types ending in 'N') will be ignored.
 * @param {boolean} [options.ignoreVoids] - If true, void pieces (those with types starting with 'voids') will be ignored.
 */
function forEachPieceInKeysState(callback, state, { ignoreNeutrals, ignoreVoids } = {}) { // state is pieces organized by key
	if (!state) return console.log("Cannot iterate through each piece in an undefined keys-state!");

	// Position with 372K pieces takes 80ms to key,
	// WHETHER that's using Object.keys(), or the time until the first iteration of "for (let key in state)"

	if (ignoreNeutrals) {
		for (const key in state) {
			const thisPieceType = state[key];
			if (thisPieceType.endsWith(colorutil.colorExtensionOfNeutrals)) continue;
			// First it inserts the type of piece into the callback, then coords of piece 
			callback(thisPieceType, coordutil.getCoordsFromKey(key)); 
		}
	} else if (ignoreVoids) {
		for (const key in state) {
			const thisPieceType = state[key];
			if (thisPieceType.startsWith('voids')) continue;
			// First it inserts the type of piece into the callback, then coords of piece 
			callback(thisPieceType, coordutil.getCoordsFromKey(key)); 
		}
	} else {
		for (const key in state) {
			const thisPieceType = state[key];
			// First it inserts the type of piece into the callback, then coords of piece 
			callback(thisPieceType, coordutil.getCoordsFromKey(key)); 
		}
	}
}


// Counting Pieces ----------------------------------------------------------------------------------------------


/**
 * Counts the number of pieces in the gamefile. Doesn't count undefined placeholders.
 * @param {Object} gamefile - The gamefile object containing piece data.
 * @param {Object} [options] - Optional settings.
 * @param {boolean} [options.ignoreVoids] - Whether to ignore void pieces.
 * @param {boolean} [options.ignoreObstacles] - Whether to ignore obstacle pieces.
 * @returns {number} The number of pieces in the gamefile.
 */
// Returns piece count of game, excluding undefineds.
function getPieceCountOfGame(gamefile, { ignoreVoids, ignoreObstacles } = {}) {
	if (!gamefile.ourPieces) return console.error("Cannot count pieces, ourPieces is not defined");

	let count = 0; // Running count list

	for (const key in gamefile.ourPieces) { // 'pawnsW'
		if (ignoreVoids && key.startsWith('voids')) continue;
		if (ignoreObstacles && key.startsWith('obstacles')) continue;

		const typeList = gamefile.ourPieces[key];
		count += getPieceCountInTypeList(typeList);
	}

	return count;
}

/**
 * Returns the number of pieces of a SPECIFIC color in a game,
 * EXCLUDING undefined placeholders
 * @param {gamefile} gamefile 
 * @param {string} color 
 * @returns {number}
 */
function getPieceCountOfColor(gamefile, color) {
	const piecesByType = gamefile.ourPieces;
	let pieceCount = 0;

	for (const type in piecesByType) {
		const thisTypesColor = colorutil.getPieceColorFromType(type);
		if (thisTypesColor !== color) continue; // Different color
		// Same color! Increment the counter
		const thisTypeList = piecesByType[type];
		pieceCount += getPieceCountInTypeList(thisTypeList);
	}

	return pieceCount;
}

/**
 * Counts the number of pieces in the gamefile of a specific type. Subtracts the number of undefined placeholders.
 * @param {gamefile} gamefile - The gamefile.
 * @param {string} type - The type of piece to count (e.g. "pawnsW")
 * @returns {number} The number of pieces of this type in the gamefile
 */
function getPieceCountOfType(gamefile, type) {
	const typeList = gamefile.ourPieces[type];
	if (typeList === undefined) return 0; // Unknown piece
	return getPieceCountInTypeList(typeList);
}

/**
 * Returns the number of pieces in a given type list (e.g. "pawnsW"),
 * EXCLUDING undefined placeholders
 * @param {number[][]} typeList - An array of coordinates where you can find all the pieces of that given type
 * @returns {number}
 */
function getPieceCountInTypeList(typeList) {
	if (typeList.undefineds) return typeList.length - typeList.undefineds.length;
	return typeList.length;
}

/**
 * Calculates and returns the total number of pieces in the `piecesByType` list, INCLUDING undefined placeholders.
 * @param {gamefile} gamefile
 * @returns {number} - The total count of all pieces in the list, including undefineds.
 */
function getPieceCount_IncludingUndefineds(gamefile) {
	const ourPieces = gamefile.ourPieces;
	let pieceCount = 0;
	for (const type in ourPieces) pieceCount += ourPieces[type].length;
	return pieceCount;
}


// Modifying Piece Data --------------------------------------------------------------------


/**
 * TODO: Perhaps move this method into a utility script that works with pieces organize by TYPE ?
 * 
 * Deletes the index from the provided piece list and updates its `undefineds` property.
 * No deleting a piece ever changes the size of this list, because the index becomes *undefined*,
 * this is so that the mesh doesn't get screwed up.
 * @param {coord[][]} list - The list of pieces of a specific type.
 * @param {number} pieceIndex - The index to delete
 */
function deleteIndexFromPieceList(list, pieceIndex) {
	list[pieceIndex] = undefined;
	// Keep track of where the undefined indices are! Have an "undefineds" array property.
	const undefinedsInsertIndex = jsutil.binarySearch_findSplitPoint(list.undefineds, pieceIndex);
	list.undefineds.splice(undefinedsInsertIndex, 0, pieceIndex);
}


// Getting All Pieces -------------------------------------------------------------------------------------------------


/**
 * Retrieves the coordinates of all pieces from the provided gamefile.
 * @param {Object} gamefile - The gamefile containing the board and pieces data.
 * @returns {number[][]} - A list of coordinates of all pieces.
 */
function getCoordsOfAllPieces(gamefile) {
	const allCoords = [];
	forEachPieceInGame(gamefile, (type, coords) => allCoords.push(coords));
	return allCoords;
}

/**
 * Retrieves the coordinates of all pieces from the provided pieces organized by key.
 * @param {Object} piecesByKey - The pieces organized by key
 * @returns {number[][]} - A list of coordinates of all pieces, where each coordinate is represented as an array [x, y].
 */
function getCoordsOfAllPiecesByKey(piecesByKey) {
	const allCoords = [];
	forEachPieceInKeysState((type, coords) => allCoords.push(coords), piecesByKey);
	return allCoords;
}

/**
 * Returns an array containing the coordinates of ALL royal pieces of the specified color.
 * @param {gamefile} gamefile 
 * @param {string} color - The color of the royals to look for.
 * @returns {number[][]} - A list of coordinates where all the royals of the provided color are at.
 */
function getRoyalCoordsOfColor(gamefile, color) {
	const ourPieces = gamefile.ourPieces;
	const royals = typeutil.royals; // ['kings', ...]
	const colorExtension = colorutil.getColorExtensionFromColor(color);

	const royalCoords = [];

	for (let i = 0; i < royals.length; i++) {
		const thisRoyalType = royals[i] + colorExtension;
		const thisTypeList = ourPieces[thisRoyalType];
		if (!thisTypeList) continue; // That piece type isn't present in this game
		forEachPieceInTypeList(coords => royalCoords.push(coords), thisTypeList);
	}

	return royalCoords;
}

/**
 * Returns a list of all the jumping royal pieces of a specific color.
 * @param {Object} gamefile
 * @param {string} color - The color of the jumping royals to look for.
 * @returns {number[][]} - A list of coordinates where all the jumping royals of the provided color are at.
 */
function getJumpingRoyalCoordsOfColor(gamefile, color) {
	const ourPieces = gamefile.ourPieces;
	const jumpingRoyals = typeutil.jumpingRoyals;
	const colorExtension = colorutil.getColorExtensionFromColor(color); // 'W' | 'B'

	const royalCoordsList = []; // A running list of all the jumping royals of this color

	for (let i = 0; i < jumpingRoyals.length; i++) {
		const thisRoyalType = jumpingRoyals[i] + colorExtension;
		const thisTypeList = ourPieces[thisRoyalType];
		if (!thisTypeList) continue; // This piece type isn't in our game
		forEachPieceInTypeList(coords => royalCoordsList.push(coords), thisTypeList);
	}

	return royalCoordsList;
}



// Finding / Retrieving a Piece by Criteria, Or Getting Information About a Piece -----------------------------------------------------------------


/**
 * Returns the specified piece's index in its type-array in the `ourPieces` property of the gamefile.
 * @param {gamefile} gamefile - The gamefile
 * @param {string} type - The type of the piece
 * @param {number[]} coords - The coordinates of the piece
 * @returns {Piece} The index of the piece
 */
function getPieceFromTypeAndCoords(gamefile, type, coords) {
	const piecesOfType = gamefile.ourPieces[type];
	if (!piecesOfType) return console.error("Cannot find piece index. Type array doesn't exist."); // Break if there are none of those piece ty
	for (let i = 0; i < piecesOfType.length; i++) {
		const thisPieceCoords = piecesOfType[i];
		// Piece is undefined. Deleted pieces are left as "undefined" so others keep their indexes!
		if (!thisPieceCoords) continue;
		// Does this piece match the coords? If so, return the piece index.
		if (coordutil.areCoordsEqual_noValidate(thisPieceCoords, coords)) return { type, coords, index: i};
	}
	throw new Error('Unable to find index of piece!');
}

/**
 * Returns the piece at the indicated coordinates, if there is one.
 * @param {gamefile} gamefile - The gamefile
 * @param {number[]} coords - The coordinates to retreive the piece at
 * @returns {Piece | undefined} The piece, or *undefined* if there isn't one: `{ type, index, coords }`
 */
function getPieceAtCoords(gamefile, coords) {
	const type = getPieceTypeAtCoords(gamefile, coords);
	if (!type) return undefined; // No piece present
	return getPieceFromTypeAndCoords(gamefile, type, coords);
}

/**
 * Returns the type of piece at the specified coords, otherwise undefined.
 * @param {gamefile} gamefile - The gamefile
 * @param {number[]} coords - The coordinates to test for a piece
 * @returns {string | undefined} The type of the piece, if there is one, otherwise undefined
 */
function getPieceTypeAtCoords(gamefile, coords) {
	const key = coordutil.getKeyFromCoords(coords);
	return gamefile.piecesOrganizedByKey[key];
}

/**
 * Calculates the piece's index position among EVERY piece in the game.
 * Used to calculate its index within in the mesh vertex data.
 * IGNORES VOIDS.
 * @param {gamefile} gamefile - The gamefile
 * @param {Object} piece - The piece: `{ type, index }`
 * @returns {number} The index of the piece
 */
function calcPieceIndexInAllPieces(gamefile, piece) {
	const type = piece.type;
	const pieceIndex = piece.index;
	if (!gamefile.ourPieces[type]) throw new Error("Cannot calculate piece index in all pieces when that type of piece isn't found in the game.");

	let index = 0; // Running index

	// We need to use the same iteration function that our regenPiecesModel() uses!
	for (const listType in gamefile.ourPieces) { // 'pawnsW'
		if (listType.startsWith('voids')) continue; // SKIP Voids!
		const list = gamefile.ourPieces[listType];

		if (listType !== type) index += list.length; // Our piece isnt in this list 
		else { // Same list our piece is in!
			index += pieceIndex;
			break;
		}
	}

	return index;
}


// Miscellanous --------------------------------------------------------------------------


/**
 * Whether a piece is on the provided coords
 * @param {gamefile} gamefile - The gamefile
 * @param {number[]} coords - The coordinates
 * @returns {boolean}
 */
function isPieceOnCoords(gamefile, coords) {
	return getPieceTypeAtCoords(gamefile, coords) !== undefined;
}

/**
 * Returns true if the game is over (gameConclusion is truthy).
 * If the game is over, it will be a string. If not, it will be false.
 * @param {gamefile} gamefile - The gamefile.
 * @returns {boolean} true if over
 */
function isGameOver(gamefile) {
	if (gamefile.gameConclusion) return true;
	return false;
}

/**
 * Returns true if the currently-viewed position of the game file is in check
 * @param {gamefile} gamefile 
 * @returns {boolean}
 */
function isCurrentViewedPositionInCheck(gamefile) {
	return gamefile.inCheck !== false;
}

/**
 * Returns a list of coordinates of all royals
 * in check in the currently-viewed position.
 * @param {gamefile} gamefile 
 * @returns {[number,number][]}
 */
function getCheckCoordsOfCurrentViewedPosition(gamefile) {
	return gamefile.inCheck || []; // Return an empty array if we're not in check.
}

/**
 * Sets the `Termination` and `Result` metadata of the gamefile, according to the game conclusion.
 * @param {gamefile} gamefile - The gamefile
 */
function setTerminationMetadata(gamefile) {
	if (!gamefile.gameConclusion) return console.error("Cannot set conclusion metadata when game isn't over yet.");

	const victorAndCondition = winconutil.getVictorAndConditionFromGameConclusion(gamefile.gameConclusion);
	const condition = winconutil.getTerminationInEnglish(gamefile, victorAndCondition.condition);
	gamefile.metadata.Termination = condition;

	const victor = victorAndCondition.victor; // white/black/draw/undefined
	gamefile.metadata.Result = metadata.getResultFromVictor(victor);
}

/**
 * Tests if the color's opponent can win from the specified win condition.
 * @param {gamefile} gamefile - The gamefile.
 * @param {string} friendlyColor - The color of friendlies.
 * @param {string} winCondition - The win condition to check against.
 * @returns {boolean} True if the opponent can win from the specified win condition, otherwise false.
 */
function isOpponentUsingWinCondition(gamefile, friendlyColor, winCondition) {
	if (!winconutil.isWinConditionValid(winCondition)) throw new Error(`Cannot test if opponent of color "${friendlyColor}" is using invalid win condition "${winCondition}"!`);
	const oppositeColor = colorutil.getOppositeColor(friendlyColor);
	return gamerules.doesColorHaveWinCondition(gamefile.gameRules, oppositeColor, winCondition);
}




// FUNCTIONS THAT SHOULD BE MOVED ELSEWHERE!!!!! They introduce too many dependancies ----------------------------------!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

/**
 * Tests if the game is over by the used win condition, and if so, sets the `gameConclusion` property according to how the game was terminated.
 * @param {gamefile} gamefile - The gamefile
 */
function doGameOverChecks(gamefile) {
	gamefile.gameConclusion = wincondition.getGameConclusion(gamefile);
}

// ---------------------------------------------------------------------------------------------------------------------!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!




export default {
	pieceCountToDisableCheckmate,
	forEachPieceInGame,
	getPieceCountOfGame,
	getPieceCountOfColor,
	getPieceCountOfType,
	getPieceCount_IncludingUndefineds,
	deleteIndexFromPieceList,
	getCoordsOfAllPieces,
	getCoordsOfAllPiecesByKey,
	getRoyalCoordsOfColor,
	getJumpingRoyalCoordsOfColor,
	getPieceFromTypeAndCoords,
	getPieceAtCoords,
	getPieceTypeAtCoords,
	calcPieceIndexInAllPieces,
	isPieceOnCoords,
	isGameOver,
	isCurrentViewedPositionInCheck,
	getCheckCoordsOfCurrentViewedPosition,
	setTerminationMetadata,
	isOpponentUsingWinCondition,
	doGameOverChecks,
};