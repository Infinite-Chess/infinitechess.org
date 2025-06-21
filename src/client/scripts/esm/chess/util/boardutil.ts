
/**
 * This script contains utility methods for working with the organized pieces of a game.
 */

import typeutil from "./typeutil.js";
import coordutil from "./coordutil.js";
import jsutil from "../../util/jsutil.js";

// Type Definitions -----------------------------------------------------------------------------------------

import type { OrganizedPieces, TypeRange } from "../logic/organizedpieces.js";
import type { Coords, CoordsKey } from "./coordutil.js";
import type { RawType, Player } from "./typeutil.js";

interface Piece {
	type: number,
	coords: Coords,
	/**
	 * Relative to the start of its type range.
	 * To get the absolute idx, use boardutil.getAbsoluteIdx.
	 * 
	 * This will be -1 if the piece does not have an index yet.
	 * This will get set to another number when it is added to the board.
	 */
	index: number,
}

/** A unique identifier for a single line of pieces. `C|X` */
type LineKey = `${number}|${number}`

// Counting Pieces ----------------------------------------------------------------------------------------------

/**
 * Counts the number of pieces in the gamefile. Doesn't count undefined placeholders.
 * @param o - The pieces
 * @param [options] - Optional settings.
 * @param [options.ignoreColors] - Whether to ignore certain colors eg p.NEUTRAL.
 * @param [options.ignoreTypes] - Whether to ignore certain types pieces.
 * @returns The number of pieces in the gamefile.
 */
function getPieceCountOfGame(o: OrganizedPieces, { ignoreColors, ignoreRawTypes }: { ignoreColors?: Set<Player>, ignoreRawTypes?: Set<RawType> } = {}): number {
	// Early exit optimization: If ignoreColors and ignoreRawTypes are not specified,
	// return the size of o.coords, since that has zero undefineds.
	if (!ignoreColors && !ignoreRawTypes) return o.coords.size;

	let count = 0; // Running count list

	for (const [type, range] of o.typeRanges) {
		if (ignoreColors && ignoreColors.has(typeutil.getColorFromType(type))) continue;
		if (ignoreRawTypes && ignoreRawTypes.has(typeutil.getRawType(type))) continue;

		count += getPieceCountOfTypeRange(range);
	}

	return count;
}

/**
 * Returns the number of pieces of a SPECIFIC color in a game,
 * EXCLUDING undefined placeholders
 */
function getPieceCountOfColor(o: OrganizedPieces, color: Player): number {
	let pieceCount = 0;

	for (const [type, range] of o.typeRanges) {
		const thisTypesColor = typeutil.getColorFromType(type);
		if (thisTypesColor !== color) continue; // Different color
		// Same color! Increment the counter
		pieceCount += getPieceCountOfTypeRange(range);
	}

	return pieceCount;
}

/**
 * Returns the number of pieces in a given type list (e.g. "pawnsW"),
 * EXCLUDING undefined placeholders
 * @param o the piece data for the game
 * @param type
 */
function getPieceCountOfType(o: OrganizedPieces, type: number): number {
	const typeList = o.typeRanges.get(type);
	if (typeList === undefined) return 0;
	return getPieceCountOfTypeRange(typeList);
}

/** Excludes undefined placeholders */
function getPieceCountOfTypeRange(range: TypeRange) {
	return (range.end - range.start) - range.undefineds.length;
}

/**
 * Calculates and returns the total number of pieces in the `OrganizedPieces` lists, INCLUDING undefined placeholders.
 */
function getPieceCount_IncludingUndefineds(o: OrganizedPieces): number {
	return o.types.length;
}

// Getting All Pieces -------------------------------------------------------------------------------------------------


/**
 * Retrieves the coordinates of all pieces from the provided pieces.
 * @param o - contains the pieces data.
 * @returns A list of coordinates of all pieces.
 */
function getCoordsOfAllPieces(o: OrganizedPieces): Coords[] {
	const allCoords: Coords[] = [];
	for (const range of o.typeRanges.values()) {
		getCoordsOfTypeRange(o, allCoords, range);
	}
	return allCoords;
}

/**
 * Returns an array containing the coordinates of ALL royal pieces of the specified color.
 * @param o - the piece lists
 * @param color - The color of the royals to look for.
 * @returns A list of coordinates where all the royals of the provided color are at.
 */
function getRoyalCoordsOfColor(o: OrganizedPieces, color: Player): Coords[] {
	const royalCoordsList: Coords[] = [];

	typeutil.forEachPieceType(t => {
		const range = o.typeRanges.get(t);
		if (range === undefined) return;

		getCoordsOfTypeRange(o, royalCoordsList, range);
	}, [color], typeutil.royals);

	return royalCoordsList;
}

/**
 * Returns a list of all the jumping royal pieces of a specific color.
 * @param o the piece lists
 * @param color - The color of the jumping royals to look for.
 * @returns A list of coordinates where all the jumping royals of the provided color are at.
 */
function getJumpingRoyalCoordsOfColor(o: OrganizedPieces, color: Player): Coords[] {
	const royalCoordsList: Coords[] = []; // A running list of all the jumping royals of this color

	typeutil.forEachPieceType(t => {
		const range = o.typeRanges.get(t);
		if (range === undefined) return;

		getCoordsOfTypeRange(o, royalCoordsList, range);
	}, [color], typeutil.jumpingRoyals);

	return royalCoordsList;
}

/**
 * Efficiently iterates through every piece in a type range,
 * skipping over undefineds placeholders, executing callback
 * on each piece idx.
 */
// eslint-disable-next-line no-unused-vars
function iteratePiecesInTypeRange(o: OrganizedPieces, type: number, callback: (idx: number) => void) {
	const range = o.typeRanges.get(type)!;
	let undefinedidx = 0;
	for (let idx = range.start; idx < range.end; idx++) {
		if (idx === range.undefineds[undefinedidx]) { // Is our next undefined piece entry, skip.
			undefinedidx++;
			continue;
		};
		callback(idx);
	}
}

/**
 * Efficiently iterates through every piece in a type range,
 * calculating if each idx is an undefined placeholder.
 */
// eslint-disable-next-line no-unused-vars
function iteratePiecesInTypeRange_IncludeUndefineds(o: OrganizedPieces, type: number, callback: (idx: number, isUndefined: boolean) => void) {
	const range = o.typeRanges.get(type)!;
	let undefinedidx = 0;
	for (let idx = range.start; idx < range.end; idx++) {
		if (idx === range.undefineds[undefinedidx]) { // Is our next undefined piece entry, skip.
			undefinedidx++;
			callback(idx, true);
		} else callback(idx, false);
	}
}

function getCoordsOfTypeRange(o: OrganizedPieces, coords: Coords[], range: TypeRange) {
	let undefinedidx = 0;
	for (let idx = range.start; idx < range.end; idx++) {
		if (idx === range.undefineds[undefinedidx]) { // Is our next undefined piece entry, skip.
			undefinedidx++;
			continue;
		};
		coords.push([o.XPositions[idx]!, o.YPositions[idx]!]);
	}
}

// Getting A Single Piece -------------------------------------------------------------------------------------------------

function getCoordsFromIdx(o: OrganizedPieces, idx: number): Coords {
	return [o.XPositions[idx]!, o.YPositions[idx]!];
}

function isIdxUndefinedPiece(o: OrganizedPieces, idx: number): boolean {
	return jsutil.binarySearch(o.typeRanges.get(o.types[idx]!)!.undefineds, idx).found;
}

function getTypeFromCoords(o: OrganizedPieces, coords: Coords): number | undefined {
	const key = coordutil.getKeyFromCoords(coords);
	if (!o.coords.has(key)) return undefined;
	const idx = o.coords.get(key)!;
	return o.types[idx]!;
}

function getIdxFromCoords(o: OrganizedPieces, coords: Coords): number | undefined {
	const key = coordutil.getKeyFromCoords(coords);
	if (!o.coords.has(key)) return undefined;
	const idx = o.coords.get(key)!;
	return idx;
}

function getPieceFromCoords(o: OrganizedPieces, coords: Coords): Piece | undefined {
	const key = coordutil.getKeyFromCoords(coords);
	if (!o.coords.has(key)) return undefined;
	const idx = o.coords.get(key)!;
	const type = o.types[idx]!;
	return {
		type,
		coords,
		index: getRelativeIdx(o, idx)
	};
}

/** Returns the relative index of a piece in its type range. */
function getRelativeIdx(o: OrganizedPieces, idx: number): number {
	return idx - o.typeRanges.get(o.types[idx]!)!.start;
}

/** Reverts the relative-ness of the piece's index to the start of its type range to get its absolute index. */
function getAbsoluteIdx(o: OrganizedPieces, piece: Piece): number {
	return piece.index + o.typeRanges.get(piece.type)!.start;
}

function getPieceFromIdx(o: OrganizedPieces, idx: number): Piece | undefined {
	if (isIdxUndefinedPiece(o, idx)) return undefined;
	const type = o.types[idx]!;
	return {
		type,
		coords: getCoordsFromIdx(o, idx),
		index: getRelativeIdx(o, idx)
	};
}

function getTypeRangeFromIdx(o: OrganizedPieces, idx: number): TypeRange {
	const type = o.types[idx];
	if (type === undefined) throw Error("Index is out of piece lists");
	if (!o.typeRanges.has(type)) throw Error("Typerange is not initialized");

	return o.typeRanges.get(type)!;
}

/**
 * Whether a piece is on the provided coords
 */
function isPieceOnCoords(o: OrganizedPieces, coords: Coords): boolean {
	return o.coords.has(coordutil.getKeyFromCoords(coords));
}

export type {
	Piece,
	LineKey,
};

export default {
	getPieceCountOfGame,
	getPieceCountOfColor,
	getPieceCountOfType,
	getPieceCountOfTypeRange,
	getPieceCount_IncludingUndefineds,

	getCoordsOfAllPieces,
	getJumpingRoyalCoordsOfColor,
	getRoyalCoordsOfColor,
	iteratePiecesInTypeRange,
	iteratePiecesInTypeRange_IncludeUndefineds,

	isIdxUndefinedPiece,
	isPieceOnCoords,
	getTypeFromCoords,
	getPieceFromCoords,
	getRelativeIdx,
	getAbsoluteIdx,
	getPieceFromIdx,
	getCoordsFromIdx,
	getTypeRangeFromIdx,
	getIdxFromCoords,
};