import typeutil from "./typeutil.js";
import coordutil from "./coordutil.js";

// Type Definitions -----------------------------------------------------------------------------------------

import type { OrganizedPieces, TypeRange } from "../logic/organizedpieces.js";
import type { Coords } from "./coordutil.js";
import type { RawType, Player } from "./typeutil.js";

interface Piece {
	type: number,
	coords: Coords,
	/** Relative to the start of its type range.
	 * To get the actual idx, add the starting point of the type range */
	index: number,
}

/**
 * A position in keys format. Entries look like: `"5,2": r.PAWN + e.W`
 */
interface Position {
	[coordKey: string]: number
}

/** A length-2 number array. Commonly used for storing directions. */
type Vec2 = [number,number]

/** The string-key of a line's step value, or a 2-dimensional vector. */
// Separated from CoordsKey so that it's clear this is meant for directions, not coordinates
type Vec2Key = `${number},${number}`;

/** A unique identifier for a single line of pieces. `C|X` */
type LineKey = `${number}|${number}`

// Counting Pieces ----------------------------------------------------------------------------------------------

/**
 * Counts the number of pieces in the gamefile. Doesn't count undefined placeholders.
 * @param gamefile - The gamefile object containing piece data.
 * @param [options] - Optional settings.
 * @param [options.ignoreVoids] - Whether to ignore void pieces.
 * @param [options.ignoreObstacles] - Whether to ignore obstacle pieces.
 * @returns The number of pieces in the gamefile.
 */
function getPieceCountOfGame(o: OrganizedPieces, { ignoreColors, ignoreTypes }: { ignoreColors?: Player[], ignoreTypes?: RawType[] } = {}): number {
	let count = 0; // Running count list

	for (const [type, range] of o.typeRanges) {
		if (ignoreColors && typeutil.getColorFromType(type) in ignoreColors) continue;
		if (ignoreTypes && typeutil.getRawType(type) in ignoreTypes) continue;

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
 * @param typeList - An array of coordinates where you can find all the pieces of that given type
 */
function getPieceCountOfType(o: OrganizedPieces, type: number): number {
	const typeList = o.typeRanges.get(type);
	if (typeList === undefined) return 0;
	return getPieceCountOfTypeRange(typeList);
}

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
 * Retrieves the coordinates of all pieces from the provided gamefile.
 * @param {Object} gamefile - The gamefile containing the board and pieces data.
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
 * @param gamefile 
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
 * @param gamefile
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

function getCoordsOfTypeRange(o: OrganizedPieces, coords: Coords[], range: TypeRange) {
	for (let idx = range.start; idx < range.end; idx++) {
		if (range.undefineds.includes(idx)) continue;
		coords.push([o.XPositions[idx]!, o.YPositions[idx]!]);
	}
}

// Getting A Single Piece -------------------------------------------------------------------------------------------------

function getCoordsFromIdx(o: OrganizedPieces, idx: number): Coords {
	return [o.XPositions[idx]!, o.YPositions[idx]!];
}

function isIdxUndefinedPiece(o: OrganizedPieces, idx: number): boolean {
	// TODO: Use binary search here instead of linear search
	return o.typeRanges.get(o.types[idx]!)!.undefineds.includes(idx);
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
		index: idx - o.typeRanges.get(type)!.start
	};
}

function getPieceFromIdx(o: OrganizedPieces, idx: number): Piece | undefined {
	if (isIdxUndefinedPiece(o, idx)) return undefined;
	const type = o.types[idx]!;
	return {
		type,
		coords: getCoordsFromIdx(o, idx),
		index: idx - o.typeRanges.get(type)!.start
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
	Vec2,
	Vec2Key,
	LineKey,
	Position
};

export default {
	getPieceCountOfGame,
	getPieceCountOfColor,
	getPieceCountOfType,
	getPieceCount_IncludingUndefineds,

	getCoordsOfAllPieces,
	getJumpingRoyalCoordsOfColor,
	getRoyalCoordsOfColor,

	isIdxUndefinedPiece,
	isPieceOnCoords,
	getTypeFromCoords,
	getPieceFromCoords,
	getPieceFromIdx,
	getCoordsFromIdx,
	getTypeRangeFromIdx,
	getIdxFromCoords,
};