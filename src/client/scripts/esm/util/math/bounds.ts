
// src/client/scripts/esm/util/math/bounds.ts

/**
 * This script contains methods for constructing and operating on bounding boxes.
 */

import type { BigDecimal } from "../bigdecimal/bigdecimal.js";
import type { BDCoords, Coords } from "../../chess/util/coordutil.js";

import bd from "../bigdecimal/bigdecimal.js";


// Type Definitions --------------------------------------------------------------


/** A arbitrarily large rectangle object with properties for the coordinates of its sides. */
interface BoundingBox {
    /** The x-coordinate of the left side of the box. */
    left: bigint,
    /** The x-coordinate of the right side of the box. */
    right: bigint,
    /** The y-coordinate of the bottom side of the box. */
    bottom: bigint,
    /** The y-coordinate of the top side of the box. */
    top: bigint
};

/** A rectangle object with properties for the coordinates of its sides, but using BigDecimal
 * instead of bigints for arbitrary deciaml precision. */
interface BoundingBoxBD {
    /** The x-coordinate of the left side of the box. */
    left: BigDecimal,
    /** The x-coordinate of the right side of the box. */
    right: BigDecimal,
    /** The y-coordinate of the bottom side of the box. */
    bottom: BigDecimal,
    /** The y-coordinate of the top side of the box. */
    top: BigDecimal
}

/** A rectangle object with properties for the coordinates of its sides, but using numbers instead of bigints. */
interface DoubleBoundingBox {
    /** The x-coordinate of the left side of the box. */
    left: number,
    /** The x-coordinate of the right side of the box. */
    right: number,
    /** The y-coordinate of the bottom side of the box. */
    bottom: number,
    /** The y-coordinate of the top side of the box. */
    top: number
};


// Constants -----------------------------------------


const TWO = bd.FromNumber(2.0);


// Construction --------------------------------------------------------


/**
 * Calculates the minimum bounding box that contains all the provided coordinates.
 */
function getBoxFromCoordsList(coordsList: Coords[]): BoundingBox {
	// Initialize the bounding box using the first coordinate
	const firstPiece = coordsList[0]!;
	const box: BoundingBox = {
		left: firstPiece[0],
		right: firstPiece[0],
		bottom: firstPiece[1],
		top: firstPiece[1],
	};

	// Expands the bounding box to include every coordinate
	for (const coord of coordsList) {
		expandBoxToContainSquare(box, coord);
	}

	return box;
}

function castDoubleBoundingBoxToBigDecimal(box: DoubleBoundingBox): BoundingBoxBD {
	return {
		left: bd.FromNumber(box.left),
		right: bd.FromNumber(box.right),
		bottom: bd.FromNumber(box.bottom),
		top: bd.FromNumber(box.top)
	};
}

function castBoundingBoxToBigDecimal(box: BoundingBox): BoundingBoxBD {
	return {
		left: bd.FromBigInt(box.left),
		right: bd.FromBigInt(box.right),
		bottom: bd.FromBigInt(box.bottom),
		top: bd.FromBigInt(box.top)
	};
}

// function castBDBoundingBoxToBigint(box: BoundingBoxBD): BoundingBox {
// 	return {
// 		left: bd.toBigInt(box.left),
// 		right: bd.toBigInt(box.right),
// 		bottom: bd.toBigInt(box.bottom),
// 		top: bd.toBigInt(box.top)
// 	};
// }

/**
 * Expands the bounding box to include the provided coordinates, if it doesn't already.
 * DESTRUCTIVE. Modifies the original box.
 */
function expandBoxToContainSquare(box: BoundingBox, coord: Coords): void {
	if (coord[0] < box.left) box.left = coord[0];
	else if (coord[0] > box.right) box.right = coord[0];
	if (coord[1] < box.bottom) box.bottom = coord[1];
	else if (coord[1] > box.top) box.top = coord[1];
}

function expandBDBoxToContainSquare(box: BoundingBoxBD, coord: BDCoords): void {
	if (bd.compare(coord[0], box.left) < 0) box.left = coord[0];
	else if (bd.compare(coord[0], box.right) > 0) box.right = coord[0];
	if (bd.compare(coord[1], box.bottom) < 0) box.bottom = coord[1];
	else if (bd.compare(coord[1], box.top) > 0) box.top = coord[1];
}

/**
 * Returns the mimimum bounding box that contains both of the provided boxes.
 */
function mergeBoundingBoxBDs(box1: BoundingBoxBD, box2: BoundingBoxBD): BoundingBoxBD {
	return {
		left: bd.min(box1.left, box2.left),
		right: bd.max(box1.right, box2.right),
		bottom: bd.min(box1.bottom, box2.bottom),
		top: bd.max(box1.top, box2.top)
	};
}


// Operations -----------------------------------------------------------------------


/**
 * Determines if one bounding box (`innerBox`) is entirely contained within another bounding box (`outerBox`).
 */
function boxContainsBox(outerBox: BoundingBoxBD, innerBox: BoundingBoxBD): boolean {
	if (bd.compare(innerBox.left, outerBox.left) < 0) return false;
	if (bd.compare(innerBox.right, outerBox.right) > 0) return false;
	if (bd.compare(innerBox.bottom, outerBox.bottom) < 0) return false;
	if (bd.compare(innerBox.top, outerBox.top) > 0) return false;

	return true;
}

/**
 * Determines if two bounding boxes have zero overlap.
 */
function areBoxesDisjoint(box1: DoubleBoundingBox, box3: DoubleBoundingBox): boolean {
	if (box1.right <= box3.left) return true;
	if (box1.left >= box3.right) return true;
	if (box1.top <= box3.bottom) return true;
	if (box1.bottom >= box3.top) return true;

	return false;
}

/**
 * Returns true if the provided box contains the square coordinate.
 */
function boxContainsSquare(box: BoundingBox, square: Coords): boolean {
	if (square[0] < box.left) return false;
	if (square[0] > box.right) return false;
	if (square[1] < box.bottom) return false;
	if (square[1] > box.top) return false;

	return true;
}

/**
 * Returns true if the provided bigdecimal box contains the square coordinate.
 */
function boxContainsSquareBD(box: BoundingBoxBD, square: BDCoords): boolean {
	if (bd.compare(square[0], box.left) < 0) return false;
	if (bd.compare(square[0], box.right) > 0) return false;
	if (bd.compare(square[1], box.bottom) < 0) return false;
	if (bd.compare(square[1], box.top) > 0) return false;

	return true;
}

/**
 * Calculates the center of a bounding box.
 */
function calcCenterOfBoundingBox(box: BoundingBoxBD): BDCoords {
	const xSum = bd.add(box.left, box.right);
	const ySum = bd.add(box.bottom, box.top);
	return [
        bd.divide_fixed(xSum, TWO),
        bd.divide_fixed(ySum, TWO)
    ];
}


// Debugging --------------------------------------------------------


/** [DEBUG] Prints a box of BigDecimal floating point edges, with their exact representations. SLOW. */
function printBDBox(box: BoundingBoxBD): void {
	// console.log(`Box: left=${bd.toNumber(box.left)}, right=${bd.toNumber(box.right)}, bottom=${bd.toNumber(box.bottom)}, top=${bd.toNumber(box.top)}`);
	console.log(`Box: left=${bd.toExactString(box.left)}, right=${bd.toExactString(box.right)}, bottom=${bd.toExactString(box.bottom)}, top=${bd.toExactString(box.top)}`);
}


// Exports ----------------------------------------------------------


export default {
	// Construction
	getBoxFromCoordsList,
	castDoubleBoundingBoxToBigDecimal,
	castBoundingBoxToBigDecimal,
	// castBDBoundingBoxToBigint,
	expandBoxToContainSquare,
	expandBDBoxToContainSquare,
	mergeBoundingBoxBDs,

	// Operations
	boxContainsBox,
	areBoxesDisjoint,
	boxContainsSquare,
	boxContainsSquareBD,
	calcCenterOfBoundingBox,

	// Debugging
	printBDBox,
};

export type {
	BoundingBox,
	BoundingBoxBD,
	DoubleBoundingBox,
};