
/**
 * This script contains utility methods for working with coordinates [x,y].
 * 
 * ZERO dependancies.
 */

import bd, { BigDecimal } from "../../util/bigdecimal/bigdecimal.js";


// Type Definitions ------------------------------------------------------------


/**
 * A length-2 array of coordinates: `[x,y]`
 * Contains infinite precision integers, represented as BigInt.
 */
type Coords = [bigint,bigint];

/**
 * A pair of arbitrarily large coordinates WITH decimal precision included.
 * Typically used for calculating graphics on the cpu-side.
 * BD = BigDecimal
 */
type BDCoords = [BigDecimal, BigDecimal]

/** For when we don't need arbitrary size. */
type DoubleCoords = [number, number]

/**
 * A pair of coordinates, represented in a string, separated by a `,`.
 * 
 * This is often used as the key for a piece in piece lists.
 * 
 * This will never be in scientific notation. However, moves beyond
 * Number.MAX_SAFE_INTEGER can't be expressed exactly.
 */
type CoordsKey = `${bigint},${bigint}`;
    

// Functions -------------------------------------------------------------------


/** Returns the key string of the coordinates: [x,y] => 'x,y' */
function getKeyFromCoords(coords: Coords): CoordsKey {
	// Casting to BigInt and back to a string avoids scientific notation.
	// toFixed(0) doesn't work for numbers above 10^21
	return `${coords[0]},${coords[1]}`;
}

/**
 * Returns a length-2 array of the provided coordinates
 * @param key - 'x,y'
 * @returns The coordinates of the piece, [x,y]
 */
function getCoordsFromKey(key: CoordsKey): Coords {
	return key.split(',').map(BigInt) as Coords;
}

/**  Returns true if the coordinates are equal. */
function areCoordsEqual(coord1: Coords, coord2: Coords): boolean {
	return coord1[0] === coord2[0] && coord1[1] === coord2[1];
}

/** Returns true if the BigDecimal coordinates are equal. */
function areBDCoordsEqual(coord1: BDCoords, coord2: BDCoords): boolean {
	return bd.areEqual(coord1[0], coord2[0]) && bd.areEqual(coord1[1], coord2[1]);
}

/**
 * Adds two coordinate pairs together component-wise.
 */
function addCoords(coord1: Coords, coord2: Coords): Coords {
	return [coord1[0] + coord2[0], coord1[1] + coord2[1]];
}

/** Adds two BigDecimal coordinates together. */
function addBDCoords(coord1: BDCoords, coord2: BDCoords): BDCoords {
	return [bd.add(coord1[0], coord2[0]), bd.add(coord1[1], coord2[1])];
}

/**
 * Subtracts two coordinate pairs together component-wise.
 * @param minuendCoord - The first coordinate pair [x1, y1] to start with.
 * @param subtrahendCoord - The second coordinate pair [x2, y2] to subtract from the minuend.
 * @returns The resulting coordinate pair after subtracting.
 */
function subtractCoords(minuendCoord: Coords, subtrahendCoord: Coords): Coords {
	return [minuendCoord[0] - subtrahendCoord[0], minuendCoord[1] - subtrahendCoord[1]];
}

/**
 * Subtracts two coordinate pairs together component-wise.
 * @param minuendCoord - The first coordinate pair [x1, y1] to start with.
 * @param subtrahendCoord - The second coordinate pair [x2, y2] to subtract from the minuend.
 * @returns The resulting coordinate pair after subtracting.
 */
function subtractBDCoords(minuendCoord: BDCoords, subtrahendCoord: BDCoords): BDCoords {
	return [bd.subtract(minuendCoord[0], subtrahendCoord[0]), bd.subtract(minuendCoord[1], subtrahendCoord[1])];
}

/**
 * Subtracts two coordinate pairs together component-wise.
 * @param minuendCoord - The first coordinate pair [x1, y1] to start with.
 * @param subtrahendCoord - The second coordinate pair [x2, y2] to subtract from the minuend.
 * @returns The resulting coordinate pair after subtracting.
 */
function subtractDoubleCoords(minuendCoord: DoubleCoords, subtrahendCoord: DoubleCoords): DoubleCoords {
	return [minuendCoord[0] - subtrahendCoord[0], minuendCoord[1] - subtrahendCoord[1]];
}

/**
 * Makes a deep copy of the provided coordinates
 */
function copyCoords(coords: Coords): Coords {
	return [...coords] as Coords;
}

/**
 * Makes a deep copy of the provided BigDecimal coordinates
 */
function copyBDCoords(coords: BDCoords): BDCoords {
	return [
		bd.clone(coords[0]),
		bd.clone(coords[1])
	];
}

/**
 * [FLOATING] Interpolates between two coordinates.
 * Fixed mantissa bit number.
 * Doesn't work well for very large distances
 * if you also need high decimal precision.
 * @param start - The starting coordinate.
 * @param end - The ending coordinate.
 * @param t - The interpolation value (between 0 and 1).
 */
function lerpCoords(start: BDCoords, end: BDCoords, t: number): BDCoords {
	const bddiff: BDCoords = subtractBDCoords(end, start);
	const bdt: BigDecimal = bd.FromNumber(t);
	// console.log('bdt:', bd.toString(bdt), 't:', t);
	const travelX = bd.multiply_floating(bddiff[0], bdt);
	const travelY = bd.multiply_floating(bddiff[1], bdt);

	return [bd.add(start[0], travelX), bd.add(start[1], travelY)];
}

/**
 * {@link lerpCoords} but for DoubleCoords.
 */
function lerpCoordsDouble(start: DoubleCoords, end: DoubleCoords, t: number): DoubleCoords {
	const diffX = end[0] - start[0];
	const diffY = end[1] - start[1];
	const travelX = diffX * t;
	const travelY = diffY * t;

	return [start[0] + travelX, start[1] + travelY];
}


// Debugging --------------------------------------------------------------------


/** [DEBUG] Stringifies a pair of BigDecimal coordinates into their exact representation. SLOW. */
function stringifyBDCoords(coords: BDCoords): string {
	// return `(${bd.toNumber(coords[0])}, ${bd.toNumber(coords[1])})`;
	// return `(${bd.toExactString(coords[0])}, ${bd.toExactString(coords[1])})`;
	return `(${bd.toString(coords[0])}, ${bd.toString(coords[1])})`;
}


// Exports --------------------------------------------------------------------



export default {
	getKeyFromCoords,
	getCoordsFromKey,
	areCoordsEqual,
	areBDCoordsEqual,
	addCoords,
	addBDCoords,
	subtractCoords,
	subtractBDCoords,
	subtractDoubleCoords,
	copyCoords,
	copyBDCoords,
	lerpCoords,
	lerpCoordsDouble,
	// Debugging
	stringifyBDCoords,
};

export type {
	Coords,
	BDCoords,
	DoubleCoords,
	CoordsKey,
};