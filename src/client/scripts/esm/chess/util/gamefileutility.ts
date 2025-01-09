
/**
 * This script contains many utility methods for working with gamefiles.
 */


import type gamefile from '../logic/gamefile.js';
import type { Piece } from '../logic/movepiece.js';
import { Coords, CoordsKey } from './coordutil.js';


import metadata from './metadata.js';
import jsutil from '../../util/jsutil.js';
import coordutil from './coordutil.js';
import colorutil from './colorutil.js';
// @ts-ignore
import typeutil from './typeutil.js';
// @ts-ignore
import winconutil from './winconutil.js';
// @ts-ignore
import gamerules from '../variants/gamerules.js';

// THIS IS ONLY USED FOR GAME-OVER CHECKMATE TESTS and inflates this files dependancy list!!!
// @ts-ignore
import wincondition from '../logic/wincondition.js'; 


// Type Definitions -----------------------------------------------------------------------------------------


/** A function meant to be called once for each piece in any organized list. */
// eslint-disable-next-line no-unused-vars
type PieceIterator = (type: string, coords: Coords, gamefile?: gamefile) => {};
/** A function meant to be called once for each piece's coordinates in any organized list. */
// eslint-disable-next-line no-unused-vars
type CoordsIterator = (coords: Coords) => {};

/** An object containing all our pieces, organized by type. */
type PiecesByType = { [pieceType: string]: TypeList }
/**
 * A list containing all pieces of a single type
 * 
 * Using an intersection type allows us to merge the properties of multiple types.
 * Type Lists, even though they are arrays, have an "undefineds" property that
 * keeps track of all the undefined indexes in the array, which is also ordered.
 */
type TypeList = (Coords | undefined)[] & { undefineds: number[] };

/**
 * An object containing all pieces organized by coordinates,
 * where the value is the type of piece on the coordinates.
 */
type PiecesByKey = { [coordsKey: CoordsKey]: string }


// Variables -----------------------------------------------------------------------------------------------


/** The maximum number of pieces in-game to still use the checkmate algorithm. Above this uses "royalcapture". */
const pieceCountToDisableCheckmate: number = 50_000;


// Iterating Through All Pieces -----------------------------------------------------------------------------------------------


/**
 * Iterates through EVERY piece in the game state, and performs specified function on the piece.
 * */
function forEachPieceInGame(gamefile: gamefile, callback: PieceIterator) {
	if (!gamefile.ourPieces) throw Error("Cannot iterate through every piece of game when there's no piece list.");
	const ignoreVoids = false;
	forEachPieceInPiecesByType(callback, gamefile.ourPieces, ignoreVoids, gamefile);
}

/**
 * Iterates through each piece in a `piecesByType` list and executes the specified callback function.
 * Skips over undefined placeholders in the list.
 * @param piecesByType - A list of pieces organized by type.
 * @param ignoreVoids - If true, skips piece types starting with "voids".
 * @param gamefile
 */
function forEachPieceInPiecesByType(callback: PieceIterator, piecesByType: PiecesByType, ignoreVoids: boolean, gamefile: gamefile) {
	if (!piecesByType) return console.log("Cannot iterate through each piece in an undefined piecesByType!");
	for (const type in piecesByType) {
		if (ignoreVoids && type.startsWith('voids')) continue;
		const thisTypeList = piecesByType[type];
		for (const thisPieceCoords of thisTypeList) {
			if (thisPieceCoords === undefined) continue; // An undefined placeholder
			callback(type, thisPieceCoords, gamefile); 
		}
	}
}

/**
 * Iterates through each piece's coords in a type list and executes the specified callback function on it.
 * Skips over undefined placeholders.
 * @param callback
 * @param typeList - A list of piece coordinates of a specific type, that MAY include undefined placeholders.
 */
function forEachPieceInTypeList(callback: CoordsIterator, typeList: (Coords | undefined)[]) { // typeList = pieces organized by type 
	for (const coords of typeList) {
		if (coords === undefined) continue; // An undefined placeholder
		callback(coords); 
	}
}

/**
 * Iterates through each piece in the provided keys-state and executes a callback function.
 * @param callback - The callback function to execute for each piece: `(type, coords) => {}`
 * @param state - The keys-state object containing pieces organized by key.
 * @param [options] - Optional settings.
 * @param [options.ignoreNeutrals] - If true, neutral pieces (those with types ending in 'N') will be ignored.
 * @param [options.ignoreVoids] - If true, void pieces (those with types starting with 'voids') will be ignored.
 */
function forEachPieceInKeysState(
	callback: PieceIterator,
	state: PiecesByKey,
	{ ignoreNeutrals, ignoreVoids }: { ignoreNeutrals?: boolean, ignoreVoids?: boolean} = {}
) {
	// Position with 372K pieces takes 80ms to key on Naviary's old machine,
	// WHETHER that's using Object.keys(), or the time until the first iteration of "for (let key in state)"

	if (ignoreNeutrals) {
		for (const key in state) {
			const thisPieceType: string = state[key];
			if (thisPieceType.endsWith(colorutil.colorExtensionOfNeutrals)) continue;
			// First it inserts the type of piece into the callback, then coords of piece 
			callback(thisPieceType, coordutil.getCoordsFromKey(key as CoordsKey)); 
		}
	} else if (ignoreVoids) {
		for (const key in state) {
			const thisPieceType: string = state[key];
			if (thisPieceType.startsWith('voids')) continue;
			// First it inserts the type of piece into the callback, then coords of piece 
			callback(thisPieceType, coordutil.getCoordsFromKey(key as CoordsKey)); 
		}
	} else {
		for (const key in state) {
			const thisPieceType: string = state[key];
			// First it inserts the type of piece into the callback, then coords of piece 
			callback(thisPieceType, coordutil.getCoordsFromKey(key as CoordsKey)); 
		}
	}
}


// Counting Pieces ----------------------------------------------------------------------------------------------


/**
 * Counts the number of pieces in the gamefile. Doesn't count undefined placeholders.
 * @param gamefile - The gamefile object containing piece data.
 * @param [options] - Optional settings.
 * @param [options.ignoreVoids] - Whether to ignore void pieces.
 * @param [options.ignoreObstacles] - Whether to ignore obstacle pieces.
 * @returns The number of pieces in the gamefile.
 */
function getPieceCountOfGame(gamefile: gamefile, { ignoreVoids, ignoreObstacles }: { ignoreVoids?: boolean, ignoreObstacles?: boolean } = {}): number {
	if (!gamefile.ourPieces) throw Error("Cannot count pieces, ourPieces is not defined");

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
 */
function getPieceCountOfColor(gamefile: gamefile, color: 'white' | 'black'): number {
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
 * @param gamefile - The gamefile.
 * @param type - The type of piece to count (e.g. "pawnsW")
 * @returns The number of pieces of this type in the gamefile
 */
function getPieceCountOfType(gamefile: gamefile, type: string): number {
	const typeList: TypeList = gamefile.ourPieces[type];
	if (typeList === undefined) return 0; // Unknown piece
	return getPieceCountInTypeList(typeList);
}

/**
 * Returns the number of pieces in a given type list (e.g. "pawnsW"),
 * EXCLUDING undefined placeholders
 * @param typeList - An array of coordinates where you can find all the pieces of that given type
 */
function getPieceCountInTypeList(typeList: TypeList): number {
	if (typeList.undefineds) return typeList.length - typeList.undefineds.length;
	return typeList.length;
}

/**
 * Calculates and returns the total number of pieces in the `piecesByType` list, INCLUDING undefined placeholders.
 */
function getPieceCount_IncludingUndefineds(gamefile: gamefile): number {
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
 * @param list - The list of pieces of a specific type.
 * @param {number} pieceIndex - The index to delete
 */
function deleteIndexFromPieceList(typeList: TypeList, pieceIndex: number) {
	typeList[pieceIndex] = undefined;
	// Keep track of where the undefined indices are! Have an "undefineds" array property.
	typeList.undefineds = jsutil.addElementToOrganizedArray(typeList.undefineds, pieceIndex);
}


// Getting All Pieces -------------------------------------------------------------------------------------------------


/**
 * Retrieves the coordinates of all pieces from the provided gamefile.
 * @param {Object} gamefile - The gamefile containing the board and pieces data.
 * @returns A list of coordinates of all pieces.
 */
function getCoordsOfAllPieces(gamefile: gamefile): Coords[] {
	const allCoords: Coords[] = [];
	forEachPieceInGame(gamefile, (type, coords) => allCoords.push(coords));
	return allCoords;
}

/**
 * Retrieves the coordinates of all pieces from the provided pieces organized by key.
 * @param piecesByKey - The pieces organized by key
 * @returns A list of coordinates of all pieces, where each coordinate is represented as an array [x, y].
 */
function getCoordsOfAllPiecesByKey(piecesByKey: PiecesByKey): Coords[] {
	const allCoords: Coords[] = [];
	forEachPieceInKeysState((type, coords) => allCoords.push(coords), piecesByKey);
	return allCoords;
}

/**
 * Returns an array containing the coordinates of ALL royal pieces of the specified color.
 * @param gamefile 
 * @param color - The color of the royals to look for.
 * @returns A list of coordinates where all the royals of the provided color are at.
 */
function getRoyalCoordsOfColor(gamefile: gamefile, color: 'white' | 'black'): Coords[] {
	const ourPieces = gamefile.ourPieces;
	const royals = typeutil.royals; // ['kings', ...]
	const colorExtension = colorutil.getColorExtensionFromColor(color);

	const royalCoords: Coords[] = [];

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
 * @param gamefile
 * @param color - The color of the jumping royals to look for.
 * @returns A list of coordinates where all the jumping royals of the provided color are at.
 */
function getJumpingRoyalCoordsOfColor(gamefile: gamefile, color: string): Coords[] {
	const ourPieces = gamefile.ourPieces;
	const jumpingRoyals = typeutil.jumpingRoyals;
	const colorExtension = colorutil.getColorExtensionFromColor(color); // 'W' | 'B'

	const royalCoordsList: Coords[] = []; // A running list of all the jumping royals of this color

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
 * @param gamefile - The gamefile
 * @param type - The type of the piece
 * @param coords - The coordinates of the piece
 * @returns The index of the piece
 */
function getPieceFromTypeAndCoords(gamefile: gamefile, type: string, coords: Coords): Piece {
	const piecesOfType = gamefile.ourPieces[type];
	if (!piecesOfType) throw Error("Cannot find piece from type and coords. Type array doesn't exist in PiecesByType object.");
	for (let i = 0; i < piecesOfType.length; i++) {
		const thisPieceCoords = piecesOfType[i];
		// Piece is undefined. Deleted pieces are left as "undefined" so others keep their indexes!
		if (!thisPieceCoords) continue;
		// Does this piece match the coords? If so, return the piece index.
		if (coordutil.areCoordsEqual_noValidate(thisPieceCoords, coords)) return { type, coords, index: i};
	}
	throw new Error('Unable to find piece from type and coords.');
}

/**
 * Returns the piece at the indicated coordinates, if there is one.
 * @param gamefile - The gamefile
 * @param coords - The coordinates to retreive the piece at
 * @returns The piece, or *undefined* if there isn't one: `{ type, index, coords }`
 */
function getPieceAtCoords(gamefile: gamefile, coords: Coords): Piece | undefined {
	const type = getPieceTypeAtCoords(gamefile, coords);
	if (!type) return undefined; // No piece present
	return getPieceFromTypeAndCoords(gamefile, type, coords);
}

/**
 * Returns the type of piece at the specified coords, otherwise undefined.
 * @param gamefile - The gamefile
 * @param coords - The coordinates to test for a piece
 * @returns The type of the piece, if there is one, otherwise undefined
 */
function getPieceTypeAtCoords(gamefile: gamefile, coords: Coords): string | undefined {
	const key = coordutil.getKeyFromCoords(coords);
	return gamefile.piecesOrganizedByKey[key];
}

/**
 * Calculates the piece's index position among EVERY piece in the game.
 * Used to calculate its index within in the mesh vertex data.
 * IGNORES VOIDS.
 * @param gamefile - The gamefile
 * @param piece - The piece: `{ type, index }`
 * @returns The index of the piece
 */
function calcPieceIndexInAllPieces(gamefile: gamefile, piece: Piece): number {
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
 */
function isPieceOnCoords(gamefile: gamefile, coords: Coords): boolean {
	return getPieceTypeAtCoords(gamefile, coords) !== undefined;
}

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

	const victorAndCondition: { victor: string, condition: string } = winconutil.getVictorAndConditionFromGameConclusion(gamefile.gameConclusion);
	const conditioInPlainEnglish: string = winconutil.getTerminationInEnglish(gamefile, victorAndCondition.condition);
	gamefile.metadata.Termination = conditioInPlainEnglish;

	gamefile.metadata.Result = metadata.getResultFromVictor(victorAndCondition.victor); // white/black/draw/undefined
}

/**
 * Tests if the color's opponent can win from the specified win condition.
 * @param gamefile - The gamefile.
 * @param friendlyColor - The color of friendlies.
 * @param winCondition - The win condition to check against.
 * @returns True if the opponent can win from the specified win condition, otherwise false.
 */
function isOpponentUsingWinCondition(gamefile: gamefile, friendlyColor: 'white' | 'black', winCondition: string): boolean {
	if (!winconutil.isWinConditionValid(winCondition)) throw new Error(`Cannot test if opponent of color "${friendlyColor}" is using invalid win condition "${winCondition}"!`);
	const oppositeColor = colorutil.getOppositeColor(friendlyColor);
	return gamerules.doesColorHaveWinCondition(gamefile.gameRules, oppositeColor, winCondition);
}




// FUNCTIONS THAT SHOULD BE MOVED ELSEWHERE!!!!! They introduce too many dependancies ----------------------------------!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

/**
 * Tests if the game is over by the used win condition, and if so, sets the `gameConclusion` property according to how the game was terminated.
 */
function doGameOverChecks(gamefile: gamefile) {
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

export type {
	PiecesByType,
	PiecesByKey,
};