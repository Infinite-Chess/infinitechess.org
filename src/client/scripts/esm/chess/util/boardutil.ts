import typeutil from "./typeutil";
import coordutil from "./coordutil";

// Type Definitions -----------------------------------------------------------------------------------------

import type { OrganizedPieces, TypeRange } from "../logic/organizedpieces";
import type { Coords } from "./coordutil";
import type { RawType, TeamColor } from "./typeutil";

interface Piece {
	type: number,
	coords: Coords,
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
function getPieceCountOfGame(o: OrganizedPieces, { ignoreColors, ignoreTypes }: { ignoreColors?: TeamColor[], ignoreTypes?: RawType[] } = {}): number {
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
function getPieceCountOfColor(o: OrganizedPieces, color: TeamColor): number {
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
	const typeList = o.typeRanges[type];
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
function getRoyalCoordsOfColor(o: OrganizedPieces, color: TeamColor): Coords[] {
	const royalCoordsList: Coords[] = [];

	typeutil.forEachPieceType(t => {
		const range = o.typeRanges[t];
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
function getJumpingRoyalCoordsOfColor(o: OrganizedPieces, color: TeamColor): Coords[] {
	const royalCoordsList: Coords[] = []; // A running list of all the jumping royals of this color

	typeutil.forEachPieceType(t => {
		const range = o.typeRanges[t];
		if (range === undefined) return;

		getCoordsOfTypeRange(o, royalCoordsList, range);
	}, [color], typeutil.jumpingroyals);

	return royalCoordsList;
}

function getCoordsOfTypeRange(o: OrganizedPieces, coords: Coords[], range: TypeRange) {
	for (let idx = range.start; idx < range.end; idx++) {
		if (idx in range.undefineds) continue;
		coords.push([o.XPositions[idx], o.YPositions[idx]]);
	}
}

// Getting A Single Piece -------------------------------------------------------------------------------------------------

function getCoordsFromIdx(o: OrganizedPieces, idx: number): Coords {
	return [o.XPositions[idx], o.YPositions[idx]];
}

function isIdxUndefinedPiece(o: OrganizedPieces, idx: number): boolean {
	return idx in o.typeRanges[o.types[idx]]!.undefineds;
}

function getTypeFromCoords(o: OrganizedPieces, coords: Coords): number | undefined {
	const key = coordutil.getKeyFromCoords(coords);
	if (!o.coords.has(key)) return undefined;
	const idx = o.coords.get(key)!;
	if (isIdxUndefinedPiece(o, idx)) return undefined;
	return o.types[idx];
}

function getPieceFromCoords(o: OrganizedPieces, coords: Coords): Piece | undefined {
	const key = coordutil.getKeyFromCoords(coords);
	if (!o.coords.has(key)) return undefined;
	const idx = o.coords.get(key)!;
	if (isIdxUndefinedPiece(o, idx)) return undefined;
	return {
		type: o.types[idx],
		coords: coords,
	};
}

function getPieceFromIdx(o: OrganizedPieces, idx: number): Piece | undefined {
	if (isIdxUndefinedPiece(o, idx)) return undefined;
	return {
		type: o.types[idx],
		coords: getCoordsFromIdx(o, idx),
	};
}

export type {
	Piece
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
	getTypeFromCoords,
	getPieceFromCoords,
	getPieceFromIdx,
	getCoordsFromIdx,
};