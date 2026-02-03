// src/shared/chess/util/bdcoords.ts

import { fromBigInt, fromNumber, isInteger, toBigInt, toNumber } from '@naviary/bigdecimal';

import type { BDCoords, Coords, DoubleCoords } from './coordutil';

// Constructors --------------------------------------------------------------------

/** Converts BigInt Coords to BDCoords (BigDecimal), capable of decimal arithmetic. */
function FromCoords(coords: Coords, precision?: number): BDCoords {
	return [fromBigInt(coords[0], precision), fromBigInt(coords[1], precision)];
}

/** Converts coordinates of javascript doubles to BDCoords (BigDecimal) */
function FromDoubleCoords(coords: DoubleCoords): BDCoords {
	return [fromNumber(coords[0]), fromNumber(coords[1])];
}

// Comparisons ------------------------------------------------------------------------

/**
 * Checks if both coordinates in a BDCoords tuple represent perfect integers.
 * This is useful for determining if a point lies exactly on an integer grid.
 * @param coords The BDCoords tuple [x, y] to check.
 * @returns True if both the x and y coordinates are whole numbers.
 */
function areCoordsIntegers(coords: BDCoords): boolean {
	return isInteger(coords[0]) && isInteger(coords[1]);
}

// Conversion ------------------------------------------------------------------------

/**
 * Converts a pair of bigdecimal coords into normal bigint Coords.
 * THIS WILL LOSE PRECISION if you aren't already confident that both
 * coordinates are integers!
 */
function coordsToBigInt(coords: BDCoords): Coords {
	// Convert each coordinate to a BigInt using the toBigInt function.
	return [toBigInt(coords[0]), toBigInt(coords[1])];
}

/**
 * Converts a pair of bigdecimal coords into DoubleCoords.
 * Only call if you are CONFIDENT all both coordinates won't overflow or underflow!
 */
function coordsToDoubles(coords: BDCoords): DoubleCoords {
	// Convert each coordinate to a BigInt using the toBigInt function.
	return [toNumber(coords[0]), toNumber(coords[1])];
}

export default {
	// Constructors
	FromCoords,
	FromDoubleCoords,
	// Comparisons
	areCoordsIntegers,
	// Conversion
	coordsToBigInt,
	coordsToDoubles,
};
