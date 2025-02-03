
/**
 * This script contains utility methods for working with coordinates [x,y].
 * 
 * ZERO dependancies.
 */


// Type Definitions ------------------------------------------------------------


/** A length-2 array of coordinates: `[x,y]` */
type Coords = [number,number];

/**
 * A pair of coordinates, represented in a string, separated by a `,`.
 * 
 * This is often used as the key for a piece in piece lists.
 * 
 * This is NOT compatible with "e" notation, so things will crash when
 * coordinates go above Number.MAX_SAFE_INTEGER
 */
type CoordsKey = `${number},${number}`;
    

// Functions -------------------------------------------------------------------


/**
 * Checks if both the x-coordinate and the y-coordinate of a point are integers.
 */
function areCoordsIntegers(coords: Coords): boolean {
	return Number.isInteger(coords[0]) && Number.isInteger(coords[1]);
}

// /**
//  * ALTERNATIVE to {@link areCoordsIntegers}, if we end up having floating point imprecision problems!
//  *
//  * Checks if a number is effectively an integer considering floating point imprecision.
//  * @param {number} num - The number to check.
//  * @param {number} [epsilon=Number.EPSILON] - The tolerance for floating point imprecision.
//  * @returns {boolean} - Returns true if the number is effectively an integer, otherwise false.
//  */
// function isEffectivelyInteger(num, epsilon = Number.EPSILON) {
//     return Math.abs(num - Math.round(num)) < epsilon;
// }

/**
 * Returns the key string of the coordinates: [x,y] => 'x,y'
 */
function getKeyFromCoords(coords: Coords): CoordsKey {
	return `${coords[0]},${coords[1]}`;
}

/**
 * Returns a length-2 array of the provided coordinates
 * @param key - 'x,y'
 * @returns The coordinates of the piece, [x,y]
 */
function getCoordsFromKey(key: CoordsKey): Coords {
	return key.split(',').map(Number) as Coords;
}

/**
 * Returns true if the coordinates are equal.
 * 
 * If one coordinate isn't provided, they are considered not equal.
 */
function areCoordsEqual(coord1?: Coords, coord2?: Coords): boolean {
	if (!coord1 || !coord2) return false; // One undefined, can't be equal
	return coord1[0] === coord2[0] && coord1[1] === coord2[1];
}

/**
 * Returns true if the coordinates are equal
 */
function areCoordsEqual_noValidate(coord1: Coords, coord2: Coords): boolean {
	return coord1[0] === coord2[0] && coord1[1] === coord2[1];
}

/**
 * Adds two coordinate pairs together component-wise.
 */
function addCoordinates(coord1: Coords, coord2: Coords): Coords {
	return [
		coord1[0] + coord2[0],
		coord1[1] + coord2[1]
	];
}

/**
 * Subtracts two coordinate pairs together component-wise.
 * @param minuendCoord - The first coordinate pair [x1, y1] to start with.
 * @param subtrahendCoord - The second coordinate pair [x2, y2] to subtract from the minuend.
 * @returns The resulting coordinate pair after subtracting.
 */
function subtractCoordinates(minuendCoord: Coords, subtrahendCoord: Coords): Coords {
	return [
		minuendCoord[0] - subtrahendCoord[0],
		minuendCoord[1] - subtrahendCoord[1]
	];
}

/**
 * Makes a deep copy of the provided coordinates
 */
function copyCoords(coords: Coords): Coords {
	return [...coords] as Coords;
}



export default {
	areCoordsIntegers,
	getKeyFromCoords,
	getCoordsFromKey,
	areCoordsEqual,
	areCoordsEqual_noValidate,
	addCoordinates,
	subtractCoordinates,
	copyCoords
};

export type {
	Coords,
	CoordsKey,
};