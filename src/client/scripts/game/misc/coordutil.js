
/**
 * This script contains utility methods for working with coordinates [x,y].
 * 
 * ZERO dependancies.
 */
    
/**
 * Checks if both the x-coordinate and the y-coordinate of a point are integers.
 * @param {number} x - The x-coordinate of the point.
 * @param {number} y - The y-coordinate of the point.
 * @returns {boolean} - Returns true if both coordinates are integers, otherwise false.
 */
function areCoordsIntegers(coords) {
	return Number.isInteger(coords[0]) && Number.isInteger(coords[1]);
}

/**
 * Returns the key string of the coordinates: [x,y] => 'x,y'
 * @param {number[]} coords - The coordinates
 * @returns {string} The key
 */
function getKeyFromCoords(coords) {
	return `${coords[0]},${coords[1]}`;
}

/**
 * Returns a length-2 array of the provided coordinates
 * @param {string} key - 'x,y'
 * @return {number[]} The coordinates of the piece, [x,y]
 */
function getCoordsFromKey(key) {
	return key.split(',').map(Number);
}

/**
 * Returns true if the coordinates are equal
 * @param {number[]} coord1 [x,y]
 * @param {number[]} coord2 [x,y]
 * @returns {boolean} Whether the coordinates are equal
 */
function areCoordsEqual(coord1, coord2) {
	if (!coord1 || !coord2) return false; // One undefined, can't be equal
	return coord1[0] === coord2[0] && coord1[1] === coord2[1];
}

function areCoordsEqual_noValidate(coord1, coord2) {
	return coord1[0] === coord2[0] && coord1[1] === coord2[1];
}

/**
 * Adds two coordinate pairs together component-wise.
 *
 * @param {number[]} coord1 - The first coordinate pair [x1, y1].
 * @param {number[]} coord2 - The second coordinate pair [x2, y2].
 * @returns {number[]} The resulting coordinate pair after addition [x1 + x2, y1 + y2].
 */
function addCoordinates(coord1, coord2) {
	return [coord1[0] + coord2[0], coord1[1] + coord2[1]];
}

/**
 * Makes a deep copy of the provided coordinates
 * @param {number[]} coords - [x,y]
 * @returns Copied coords
 */
function copyCoords(coords) {
	return [coords[0], coords[1]];
}


export default {
	areCoordsIntegers,
	getKeyFromCoords,
	getCoordsFromKey,
	areCoordsEqual,
	areCoordsEqual_noValidate,
	addCoordinates,
	copyCoords
};