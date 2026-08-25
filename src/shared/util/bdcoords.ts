// src/shared/util/bdcoords.ts

/**
 * Constructing, comparing and converting BDCoords — coordinate pairs held as
 * BigDecimals, so they carry decimal precision at arbitrary magnitude.
 */

import type { BDCoords, Coords, DoubleCoords } from './coordutil.js';

import { fromBigInt, fromNumber, isInteger, toBigInt, toNumber } from '@naviary/bigdecimal';

// Constructors ----------------------------------------------------------------

/** Converts BigInt Coords to BDCoords (BigDecimal), capable of decimal arithmetic. */
function fromCoords(coords: Coords, precision?: number): BDCoords {
	return [fromBigInt(coords[0], precision), fromBigInt(coords[1], precision)];
}

/** Converts coordinates of javascript doubles to BDCoords (BigDecimal). */
function fromDoubleCoords(coords: DoubleCoords): BDCoords {
	return [fromNumber(coords[0]), fromNumber(coords[1])];
}

// Comparisons -----------------------------------------------------------------

/** Whether both coordinates are perfect integers — i.e. the point lies exactly on the grid. */
function areCoordsIntegers(coords: BDCoords): boolean {
	return isInteger(coords[0]) && isInteger(coords[1]);
}

// Conversion ------------------------------------------------------------------

/**
 * Converts a pair of bigdecimal coords into normal bigint Coords.
 * THIS WILL LOSE PRECISION if you aren't already confident that both
 * coordinates are integers!
 */
function coordsToBigInt(coords: BDCoords): Coords {
	return [toBigInt(coords[0]), toBigInt(coords[1])];
}

/**
 * Converts a pair of bigdecimal coords into DoubleCoords.
 * Only call if you are CONFIDENT both coordinates won't overflow or underflow!
 */
function coordsToDoubles(coords: BDCoords): DoubleCoords {
	return [toNumber(coords[0]), toNumber(coords[1])];
}

// Exports ---------------------------------------------------------------------

export default {
	// Constructors
	fromCoords,
	fromDoubleCoords,
	// Comparisons
	areCoordsIntegers,
	// Conversion
	coordsToBigInt,
	coordsToDoubles,
};
