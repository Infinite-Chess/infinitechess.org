
/**
 * This script manages the organized lines of all pieces in the current game.
 * For example, pieces organized by type, coordinate, vertical, horizontal, diagonal, etc.
 * 
 * These dramatically increase speed of legal move calculation.
 */

import math from '../../util/math.js';
import colorutil from '../util/colorutil.js';
import coordutil from '../util/coordutil.js';
// @ts-ignore
import gamefileutility from '../util/gamefileutility.js';
//@ts-ignore
import typeutil from '../util/typeutil.js';

// @ts-ignore
import type gamefile from './gamefile.js';
import type { Coords, CoordsKey } from '../util/coordutil.js';
import type { Piece } from './boardchanges.js';
import type { Vec2 } from '../../util/math.js';
import clientEventDispatcher from '../../util/clientEventDispatcher.js';



// Amount of extra undefined pieces to store with each type array!
// These placeholders are utilized when pieces are added or pawns promote!
const extraUndefineds = 5; // After this many promotions, need to add more undefineds and recalc the model!
/** {@link extraUndefineds}, but when in the board editor. */
const extraUndefineds_Editor = 100;


// Type Definitions ---------------------------------------------------------------------------------------


/** The string-key of a line's step value, or a 2-dimensional vector. */
// Separated from CoordsKey so that it's clear this is meant for directions, not coordinates
type Vec2Key = `${number},${number}`;




/** An object containing all our pieces, organized by type. */
type PiecesByType = { [pieceType: string]: PooledArray<Coords> }

/**
 * An array type that allows for undefined placeholders,
 * and contains an `undefined` property that is an ordered (ascending)
 * array containing all the indexes that *are undefined*.
 * This allows us to efficiently keep track of them.
 */
class PooledArray<T> extends Array<T|undefined> {
	undefineds: Array<number>;
	constructor(...items: T[]) {
		super(...items);
		this.undefineds = [];
	}

	/** Adds a single undefined placeholder to the end of this pooled array. */
	addUndefineds() {
		const insertedIndex = this.push(undefined) - 1; // insertedIndex = New length - 1
		this.undefineds.push(insertedIndex);
	}
}

/** An object containing all pieces organized by coordinates,
 * where the value is the type of piece on the coordinates. */
type PiecesByKey = { [coordsKey: CoordsKey]: string }

/** An object containing our pieces organized by lines */
interface LinesByStep {
	[line: Vec2Key]: PieceLinesByKey
}

/** An object containing the pieces organized by a single line direction. */
interface PieceLinesByKey {
	[line: LineKey]: Array<Piece>
}

/** A unique identifier for a single line of pieces. `C|X` */
type LineKey = `${number}|${number}`


// Functions ----------------------------------------------------------------------------


/**
 * Organizes all the pieces of the specified game into many different lists,
 * organized in different ways. For example, organized by key `'1,2'`,
 * or by type `'queensW'`, or by row/column/diagonal.
 * 
 * These are helpful because they vastly improve performance. For instance,
 * if we know the coordinates of a piece, we don't have to iterate
 * through the entire list of pieces to find its type.
 */
function initOrganizedPieceLists(gamefile: gamefile) {
	if (!gamefile.ourPieces) return console.error("Cannot init the organized lines before ourPieces is defined.");
    
	// console.log("Begin organizing lists...")

	resetOrganizedLists(gamefile);
	// Organize each piece with a callback function.
	// We need .bind(this) to specify our parent object for the callback!
	// Otherwise it would not be able to access our gamefile's properties such as the organized lists to push to.
	gamefileutility.forEachPieceInGame(gamefile, organizePiece);
    
	// console.log("Finished organizing lists!")
}

function resetOrganizedLists(gamefile: gamefile) {
	gamefile.piecesOrganizedByKey = {};
	gamefile.piecesOrganizedByLines = {};

	const lines = gamefile.startSnapshot.slidingPossible;
	for (let i = 0; i < lines.length; i++) {
		gamefile.piecesOrganizedByLines[coordutil.getKeyFromCoords(lines[i])] = {};
	}
}

// Inserts given piece into all the organized piece lists (key, row, column...)
function organizePiece(type: string, coords: Coords, gamefile?: gamefile): void {
	if (!coords) return; // Piece is undefined, skip this one!
	if (typeof(gamefile) === "undefined") throw Error("Cannot organize piece without gamefile");
	const piece = { type, coords };

	// Organize by key
	// First, turn the coords into a key in the format 'x,y'
	let key: string = coordutil.getKeyFromCoords(coords);
	// Is there already a piece there? (Desync)
	if (gamefile.piecesOrganizedByKey[key]) throw Error(`While organizing a piece, there was already an existing piece there!! ${coords}`);
	gamefile.piecesOrganizedByKey[key] = type;
    
	// Organize by line
	const lines = gamefile.startSnapshot.slidingPossible;
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		key = getKeyFromLine(line,coords);
		const strline = coordutil.getKeyFromCoords(line);
		// Is line initialized
		if (!gamefile.piecesOrganizedByLines[strline][key]) gamefile.piecesOrganizedByLines[strline][key] = [];
		gamefile.piecesOrganizedByLines[strline][key].push(piece);
	}
    
}

// Remove specified piece from all the organized piece lists (piecesOrganizedByKey, etc.)
function removeOrganizedPiece(gamefile: gamefile, coords: Coords) {

	// Make the piece key undefined in piecesOrganizedByKey object  
	let vec2Key: CoordsKey = coordutil.getKeyFromCoords(coords);
	if (!gamefile.piecesOrganizedByKey[vec2Key]) throw Error(`No organized piece at coords ${coords} to delete!`);
	// Delete is needed, I can't just set the key to undefined, because the object retains the key as 'undefined'
	delete gamefile.piecesOrganizedByKey[vec2Key]; 

	const lines = gamefile.startSnapshot.slidingPossible;
	lines.forEach((line: Coords) => { // For every line possible in the game...
		vec2Key = coordutil.getKeyFromCoords(line);
		const linekey = getKeyFromLine(line,coords);
		removePieceFromLine(gamefile.piecesOrganizedByLines[vec2Key], linekey);
	});

	// Takes a line from a property of an organized piece list, deletes the piece at specified coords
	function removePieceFromLine(organizedPieces: PieceLinesByKey, lineKey: LineKey) {
		const line = organizedPieces[lineKey]!;

		for (let i = 0; i < line.length; i++) {
			const thisPieceCoords = line[i]!.coords;
			if (thisPieceCoords[0] === coords[0] && thisPieceCoords[1] === coords[1]) {
				line.splice(i, 1); // Delete
				// If the line length is now 0, remove itself from the organizedPieces
				if (line.length === 0) delete organizedPieces[lineKey];
				break;
			}
		}
	}
}

function areWeShortOnUndefineds(gamefile: gamefile) {
	for (const [key,value] of Object.entries(gamefile.ourPieces)) {
		if (getTypeUndefinedsBehavior(gamefile, key) === 0) continue;
		if ((value as PooledArray<Coords>).undefineds.length === 0) return true;
	}
	return false;
}

/**
 * Adds more undefined placeholders, or *null* pieces, into the piece lists,
 * to allocate more space in the mesh of all the pieces, then regenerates the mesh.
 * Makes sure each piece list has the bare minimum number of undefineds.
 * These placeholders are used up when pawns promote.
 * When they're gone, we have to regenerate the mesh, with more empty placeholders.
 * @param gamefile - The gamefile
 * @param options - An object containing the various properties:
 * - `regenModel`: Whether to renegerate the model of all the pieces afterward. Default: *true*.
 * - `log`: Whether to log to the console that we're adding more undefineds. Default: *false*
 */
function addMoreUndefineds(gamefile: gamefile, { log = false } = {}) {
	if (log) console.log('Adding more placeholder undefined pieces.');
    
	for (const [key,value] of Object.entries(gamefile.ourPieces)) {
		const undefinedsBehavior = getTypeUndefinedsBehavior(gamefile, key);
		if (undefinedsBehavior === 0) continue; // This piece does not need undefineds
		const list = value as PooledArray<Coords>;
		// In the board editor, the length of the list should be doubled every time we run out of undefined slots, with a minimum of 100.
		const expectedUndefinedCount = gamefile.editor ? Math.max(extraUndefineds_Editor, (list.length - list.undefineds.length)) : extraUndefineds;
		for (let i = list.undefineds.length; i < expectedUndefinedCount; i++) list.addUndefineds();
	}

	// piecesmodel.regenModel(gamefile);
	/**
	 * DISPATCH an event instead of calling piecesmodel.regenModel directly,
	 * that way we don't tie up the game code as a dependancy.
	 */
	// console.log("Fired 'inserted-undefineds' event.");
	clientEventDispatcher.dispatch('inserted-undefineds');
}

/**
 * Returns a number signifying the importance of this piece type needing undefineds placeholders in its type list.
 * 
 * 0 => Pieces of this type can not increase in count in this gamefile
 * 1 => Can increase in count, but slowly (promotion)
 * 2 => Can increase in count rapidly (board editor)
 */
function getTypeUndefinedsBehavior(gamefile: gamefile, type: string): 0 | 1 | 2 {
	if (gamefile.editor) return 2; // gamefile is in the board editor, EVERY piece needs undefined placeholders, and a lot of them!

	if (!gamefile.gameRules.promotionsAllowed) return 0; // No pieces can promote, definitely not appending undefineds to this piece.
	const color = colorutil.getPieceColorFromType(type);
	if (!gamefile.gameRules.promotionsAllowed[color]) return 0; // Eliminates neutral pieces.
	const trimmedType = colorutil.trimColorExtensionFromType(type);
	if (!gamefile.gameRules.promotionsAllowed[color].includes(trimmedType)) return 0; // Eliminates all pieces that can't be promoted to

	return 1; // Pieces of this type CAN be added to the game, but rarely (promotion).
}

/**
 * Converts a piece list organized by key to organized by type.
 * @returns Pieces organized by type: `{ pawnsW: [ [1,2], [2,2], ...]}`
 */
function buildStateFromKeyList(gamefile: gamefile): PiecesByType {
	const keyList = gamefile.startSnapshot.position;
	const state = getEmptyTypeState(gamefile);

	// For some reason, does not iterate through inherited properties?
	for (const key in keyList) {
		const type = keyList[key];
		const coords = coordutil.getCoordsFromKey(key as CoordsKey);
		// Does the type parameter exist?
		// if (!state[type]) state[type] = []
		if (!state[type]) throw Error(`Error when building state from key list. Type ${type} is undefined!`);
		// Push the coords
		state[type].push(coords);
	}

	return state;
}

/**
 * 
 * @param {gamefile} gamefile
 */
function getEmptyTypeState(gamefile: gamefile) {
	const typesInGame = gamefile.startSnapshot.existingTypes; // ['pawns','queens']
	const state: PiecesByType = {};

	const neutralTypes = typeutil.neutralTypes; // ['obstacles', 'voids']

	const whiteExt = colorutil.getColorExtensionFromColor('white');
	const blackExt = colorutil.getColorExtensionFromColor('black');
	const neutralExt = colorutil.getColorExtensionFromColor('neutral');
	
	// If in the board editor, EVERY type of piece can commonly be added, so we need both a list of, and undefineds, for every type of piece.
	if (gamefile.editor) typeutil.forEachPieceType((type: string) => state[type] = new PooledArray());
	else for (const type of typesInGame) {
		if (neutralTypes.includes(type)) { 
			state[type + neutralExt] = new PooledArray();
		} else {
			state[type + whiteExt] = new PooledArray();
			state[type + blackExt] = new PooledArray();
		}
	}

	return state;
}

/**
 * Returns a string that is a unique identifier of a given organized line: `"C|X"`.
 * Where `C` is the c in the linear standard form of the line: "ax + by = c",
 * and `X` is the nearest x-value the line intersects on or after the y-axis.
 * For example, the line with step-size [2,0] that starts on point (0,0) will have an X value of '0',
 * whereas the line with step-size [2,0] that starts on point (1,0) will have an X value of '1',
 * because it's step size means it never intersects the y-axis at x = 0, but x = 1 is the nearest it gets to it, after 0.
 * 
 * If the line is perfectly vertical, the axis will be flipped, so `X` in this
 * situation would be the nearest **Y**-value the line intersects on or above the x-axis.
 * @param {Vec2} step - Line step `[dx,dy]`
 * @param {Coords} coords `[x,y]` - A point the line intersects
 * @returns {String} the key `C|X`
 */
function getKeyFromLine(step: Vec2, coords: Coords): LineKey {
	const C = math.getLineCFromCoordsAndVec(coords, step);
	const X = getXFromLine(step, coords);
	return `${C}|${X}`;
}

/**
 * Calculates the `X` value of the line's key from the provided step direction and coordinates,
 * which is the nearest x-value the line intersects on or after the y-axis.
 * For example, the line with step-size [2,0] that starts on point (0,0) will have an X value of '0',
 * whereas the line with step-size [2,0] that starts on point (1,0) will have an X value of '1',
 * because it's step size means it never intersects the y-axis at x = 0, but x = 1 is the nearest it gets to it, after 0.
 * 
 * If the line is perfectly vertical, the axis will be flipped, so `X` in this
 * situation would be the nearest **Y**-value the line intersects on or above the x-axis.
 * @param {Vec2} step - [dx,dy]
 * @param {Coords} coords - Coordinates that are on the line
 * @returns {number} The X in the line's key: `C|X`
 */
function getXFromLine(step: Coords, coords: Coords): number {
	// See these desmos graphs for inspiration for finding what line the coords are on:
	// https://www.desmos.com/calculator/d0uf1sqipn
	// https://www.desmos.com/calculator/t9wkt3kbfo

	const lineIsVertical = step[0] === 0;
	const deltaAxis = lineIsVertical ? step[1] : step[0];
	const coordAxis = lineIsVertical ? coords[1] : coords[0];
	return math.posMod(coordAxis, deltaAxis);
}

/** Splits the `C` value out of the line key */
function getCFromKey(lineKey: LineKey): number {
	return Number(lineKey.split('|')[0]);
}

/**
 * Tests if the provided gamefile has colinear organized lines present in the game.
 * This can occur if there are sliders that can move in the same exact direction as others.
 * For example, [2,0] and [3,0]. We typically like to know this information because
 * we want to avoid having trouble with calculating legal moves surrounding discovered attacks
 * by using royalcapture instead of checkmate.
 */
function areColinearSlidesPresentInGame(gamefile: gamefile): boolean {
	const slidingPossible = gamefile.startSnapshot.slidingPossible; // [[1,1],[1,0]]

	// How to know if 2 lines are colinear?
	// They will have the exact same slope!

	// Iterate through each line, comparing its slope with every other line
	for (let a = 0; a < slidingPossible.length - 1; a++) {
		const line1 = slidingPossible[a]; // [dx,dy]
		const slope1 = line1[1] / line1[0]; // Rise/Run
		const line1IsVertical = isNaN(slope1);
        
		for (let b = a + 1; b < slidingPossible.length; b++) {
			const line2 = slidingPossible[b]; // [dx,dy]
			const slope2 = line2[1] / line2[0]; // Rise/Run
			const line2IsVertical = isNaN(slope2);

			if (line1IsVertical && line2IsVertical) return true; // Colinear!
			if (slope1 === slope2) return true; // Colinear!
		}
	}
	return false;
}

/**
 * Tests if the provided gamefile has hippogonal lines present in the game.
 * True if there are knightriders or higher riders.
 */
function areHippogonalsPresentInGame(slidingPossible: Vec2[]): boolean {
	for (let i = 0; i < slidingPossible.length; i++) {
		const thisSlideDir: Vec2 = slidingPossible[i]!;
		if (Math.abs(thisSlideDir[0]) > 1) return true;
		if (Math.abs(thisSlideDir[1]) > 1) return true;
	}
	return false;
}

export type {
	PooledArray,
	PiecesByKey,
	PiecesByType,
	PieceLinesByKey,
	LinesByStep,
	LineKey,
};

export default {
	initOrganizedPieceLists,
	organizePiece,
	removeOrganizedPiece,
	areWeShortOnUndefineds,
	addMoreUndefineds,
	buildStateFromKeyList,
	getKeyFromLine,
	getCFromKey,
	areColinearSlidesPresentInGame,
	areHippogonalsPresentInGame,
};