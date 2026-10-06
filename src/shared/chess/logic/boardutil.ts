// src/shared/chess/logic/boardutil.ts

/**
 * This script contains utility methods for working with the organized pieces of a game.
 */

import type { RawType, Player } from '../util/typeutil.js';
import type { Coords, CoordsKey } from '../../util/coordutil.js';
import type { OrganizedPieces, OrganizedPiecesBase, TypeRange } from './organizedpieces.js';

import typeutil from '../util/typeutil.js';
import coordutil from '../../util/coordutil.js';
import organizedpieces from './organizedpieces.js';
import bounds, { BoundingBox } from '../../util/math/bounds.js';

// Types -----------------------------------------------------------------------

export interface Piece {
	type: number;
	coords: Coords;
	/**
	 * Relative to the start of its type range.
	 * To get the absolute idx, use boardutil.getAbsoluteIdx.
	 *
	 * This will be -1 if the piece does not have an index yet.
	 * This will get set to another number when it is added to the board.
	 */
	index: number;
}

// Counting Pieces -------------------------------------------------------------

/**
 * Counts the number of pieces on the board. Doesn't count undefined placeholders.
 * `ignoreColors` and `ignoreRawTypes` leave the colors/raw types they name out of the count.
 */
function getPieceCountOfGame(
	o: OrganizedPiecesBase,
	{
		ignoreColors,
		ignoreRawTypes,
	}: { ignoreColors?: Set<Player>; ignoreRawTypes?: Set<RawType> } = {},
): number {
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
 * Counts the total number of royal pieces (jumping + sliding) in the game.
 * @param o - The organized pieces data
 * @returns The total number of royal pieces on the board
 */
function getRoyalCountOfGame(o: OrganizedPiecesBase): number {
	let royalCount = 0;

	for (const [type, range] of o.typeRanges) {
		if (!typeutil.royals.includes(typeutil.getRawType(type))) continue; // Not a royal

		royalCount += getPieceCountOfTypeRange(range);
	}

	return royalCount;
}

/**
 * Returns the number of pieces of a SPECIFIC color in a game,
 * EXCLUDING undefined placeholders
 */
function getPieceCountOfColor(o: OrganizedPiecesBase, color: Player): number {
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
 * EXCLUDING undefined placeholders.
 * @param o - the piece data for the game
 * @param type
 */
function getPieceCountOfType(o: OrganizedPiecesBase, type: number): number {
	const typeList = o.typeRanges.get(type);
	if (typeList === undefined) return 0;
	return getPieceCountOfTypeRange(typeList);
}

/** Returns the number of pieces in a given type range, EXCLUDING undefined placeholders. */
function getPieceCountOfTypeRange(range: TypeRange): number {
	return range.end - range.start - range.undefineds.length;
}

// Getting All Pieces ----------------------------------------------------------

/**
 * Retrieves the coordinates of all pieces.
 * @param o - contains the pieces data.
 * @returns A list of coordinates of all pieces.
 */
function getCoordsOfAllPieces(o: OrganizedPiecesBase): Coords[] {
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
function getRoyalCoordsOfColor(o: OrganizedPiecesBase, color: Player): Coords[] {
	const royalCoordsList: Coords[] = [];

	typeutil.forEachPieceType(
		(t) => {
			const range = o.typeRanges.get(t);
			if (range === undefined) return;

			getCoordsOfTypeRange(o, royalCoordsList, range);
		},
		[color],
		typeutil.royals,
	);

	return royalCoordsList;
}

/**
 * O(sqrt(n)) algorithm to get the bounding box of all pieces using organized slide lines.
 * Falls back to O(n) if no vertical or horizontal slides are in the game.
 */
function getBoundingBoxOfAllPieces(o: OrganizedPieces): BoundingBox | undefined {
	if (o.coords.size === 0) return undefined; // No pieces

	const lineGroups = Array.from(o.lines.values());
	const vertGroup = lineGroups.find((group) => group.step[0] === 0n); // A single vertical slide direction
	const horzGroup = lineGroups.find((group) => group.step[1] === 0n); // A single horizontal slide direction

	if (vertGroup === undefined || horzGroup === undefined) {
		// This can happen in practice checkmate 1K3NR-1k.
		// Only console warn if there is a large number of pieces
		if (o.coords.size > 1_000_000)
			console.warn('Falling back to slower O(n) bounding box calculation for all pieces. Either no vertical or horizontal slide found.'); // prettier-ignore
		// Fallback to O(n) algorithm, we don't have the advantage of organized lines to optimize this.
		const allCoords = getCoordsOfAllPieces(o);
		return bounds.getBoxFromCoordsList(allCoords);
	}

	// Find the left-most and right-most vertical lines
	let left: bigint | undefined = undefined;
	let right: bigint | undefined = undefined;
	for (const lineKey of vertGroup.lines.keys()) {
		const C = organizedpieces.getCFromKey(lineKey);
		const x = C / -vertGroup.step[1]; // Reverse engineered vectors.getLineCFromCoordsAndVec() to obtain x
		if (left === undefined || x < left) left = x;
		if (right === undefined || x > right) right = x;
	}

	// Find the bottom-most and top-most horizontal lines
	let bottom: bigint | undefined = undefined;
	let top: bigint | undefined = undefined;
	for (const lineKey of horzGroup.lines.keys()) {
		const C = organizedpieces.getCFromKey(lineKey);
		const y = C / horzGroup.step[0]; // Reverse engineered vectors.getLineCFromCoordsAndVec() to obtain y
		if (bottom === undefined || y < bottom) bottom = y;
		if (top === undefined || y > top) top = y;
	}

	if (left === undefined || right === undefined || bottom === undefined || top === undefined)
		throw new Error('Failed to calculate bounding box of all pieces. Lines of slide direction was empty (failure of organizedpieces)'); // prettier-ignore

	return { left, right, bottom, top };
}

/** Yields every piece of the specified color, one at a time, so callers may stop early. */
function* iteratePiecesOfColor(o: OrganizedPiecesBase, color: Player): Generator<Piece> {
	for (const [type, range] of o.typeRanges) {
		if (typeutil.getColorFromType(type) !== color) continue;
		let undefinedidx = 0;
		for (let idx = range.start; idx < range.end; idx++) {
			if (idx === range.undefineds[undefinedidx]) {
				// Is our next undefined piece entry, skip.
				undefinedidx++;
				continue;
			}
			yield getDefinedPieceFromIdx(o, idx);
		}
	}
}

/**
 * Efficiently iterates through every piece in a type range,
 * skipping over undefineds placeholders, executing callback
 * on each piece idx.
 */
function iteratePiecesInTypeRange(
	o: OrganizedPiecesBase,
	type: number,
	callback: (idx: number) => void,
): void {
	const range = o.typeRanges.get(type)!;
	let undefinedidx = 0;
	for (let idx = range.start; idx < range.end; idx++) {
		if (idx === range.undefineds[undefinedidx]) {
			// Is our next undefined piece entry, skip.
			undefinedidx++;
			continue;
		}
		callback(idx);
	}
}

/**
 * Efficiently iterates through every piece in a type range,
 * calculating if each idx is an undefined placeholder.
 */
function iteratePiecesInTypeRange_IncludeUndefineds(
	o: OrganizedPiecesBase,
	type: number,
	callback: (idx: number, isUndefined: boolean) => void,
): void {
	const range = o.typeRanges.get(type)!;
	let undefinedidx = 0;
	for (let idx = range.start; idx < range.end; idx++) {
		const isUndefined = idx === range.undefineds[undefinedidx];
		if (isUndefined) undefinedidx++;
		callback(idx, isUndefined);
	}
}

/** Appends every occupied coordinate in a type's range onto `coords`. */
function getCoordsOfTypeRange(o: OrganizedPiecesBase, coords: Coords[], range: TypeRange): void {
	let undefinedidx = 0;
	for (let idx = range.start; idx < range.end; idx++) {
		if (idx === range.undefineds[undefinedidx]) {
			// Is our next undefined piece entry, skip.
			undefinedidx++;
			continue;
		}
		coords.push([o.XPositions[idx]!, o.YPositions[idx]!]);
	}
}

// Getting A Single Piece ------------------------------------------------------

/** The coordinates of the piece at an absolute index. */
function getCoordsFromIdx(o: OrganizedPiecesBase, idx: number): Coords {
	return [o.XPositions[idx]!, o.YPositions[idx]!];
}

/** The type of the piece on these coords, or undefined if the square is empty. */
function getTypeFromCoords(o: OrganizedPiecesBase, coords: Coords): number | undefined {
	const idx = o.coords.get(coordutil.getKeyFromCoords(coords));
	if (idx === undefined) return undefined;
	return o.types[idx]!;
}

/** The piece on these coords, or undefined if the square is empty. */
function getPieceFromCoords(o: OrganizedPiecesBase, coords: Coords): Piece | undefined {
	const idx = o.coords.get(coordutil.getKeyFromCoords(coords));
	if (idx === undefined) return undefined;
	const type = o.types[idx]!;
	return {
		type,
		coords,
		index: getRelativeIdx(o, idx),
	};
}

/** The piece on this coords key, or undefined if the square is empty. */
function getPieceFromCoordsKey(o: OrganizedPiecesBase, coordsKey: CoordsKey): Piece | undefined {
	const idx = o.coords.get(coordsKey);
	if (idx === undefined) return undefined;
	const type = o.types[idx]!;
	return {
		type,
		coords: coordutil.getCoordsFromKey(coordsKey),
		index: getRelativeIdx(o, idx),
	};
}

/** Returns the relative index of a piece in its type range. */
function getRelativeIdx(o: OrganizedPiecesBase, idx: number): number {
	return idx - o.typeRanges.get(o.types[idx]!)!.start;
}

/** Reverts the relative-ness of the piece's index to the start of its type range to get its absolute index. */
function getAbsoluteIdx(o: OrganizedPiecesBase, piece: Piece): number {
	return piece.index + o.typeRanges.get(piece.type)!.start;
}

/** The piece at an absolute index, which must hold a real piece, not an undefined placeholder. */
function getDefinedPieceFromIdx(o: OrganizedPiecesBase, idx: number): Piece {
	const type = o.types[idx]!;
	return {
		type,
		coords: getCoordsFromIdx(o, idx),
		index: getRelativeIdx(o, idx),
	};
}

/** Whether a piece is on the provided coords */
function isPieceOnCoords(o: OrganizedPiecesBase, coords: Coords): boolean {
	return o.coords.has(coordutil.getKeyFromCoords(coords));
}

// Exports ---------------------------------------------------------------------

export default {
	// Counting Pieces
	getPieceCountOfGame,
	getRoyalCountOfGame,
	getPieceCountOfColor,
	getPieceCountOfType,
	getPieceCountOfTypeRange,
	// Getting All Pieces
	getCoordsOfAllPieces,
	getRoyalCoordsOfColor,
	getBoundingBoxOfAllPieces,
	iteratePiecesOfColor,
	iteratePiecesInTypeRange,
	iteratePiecesInTypeRange_IncludeUndefineds,
	// Getting A Single Piece
	getCoordsFromIdx,
	getTypeFromCoords,
	getPieceFromCoords,
	getPieceFromCoordsKey,
	getRelativeIdx,
	getAbsoluteIdx,
	getDefinedPieceFromIdx,
	isPieceOnCoords,
};
