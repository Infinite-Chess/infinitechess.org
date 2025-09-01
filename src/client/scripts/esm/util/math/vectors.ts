
// src/client/scripts/esm/util/math/vector.ts

/**
 * This script contains methods for performing vector calculations,
 * such as calculating angles, distances, and other operations.
 */


import bimath from "../bigdecimal/bimath.js";
import bd, { BigDecimal } from "../bigdecimal/bigdecimal.js";

import type { BDCoords, Coords, DoubleCoords } from "../../chess/util/coordutil.js";


// Type Definitions -----------------------------------------------------------


/** A length-2 number array. Commonly used for storing directions. */
type Vec2 = [bigint,bigint]

/** 
 * A pair of x & y vectors, represented in a string, separated by a `,`.
 * 
 * This is often used as the key for a slide direction in an object.
 */
type Vec2Key = `${bigint},${bigint}`

/** A length-3 number array. Commonly used for storing positional and scale transformations. */
type Vec3 = [number,number,number]

/**
 * A maethematical ray, starting from a single point
 * and going out to infinity in one direction.
 */
type Ray = {
    start: Coords
    vector: Vec2

    /** The line in general form (A, B, C coefficients) */
    line: LineCoefficients
}

/**
 * Coefficients A, B, C, of a line in general form.
 * These can be bigints because all lines, rays, and segment
 * points inside the game are integers.
 */
type LineCoefficients = [bigint, bigint, bigint];

/**
 * {@link LineCoefficients} but for BigDecimal lines (requiring decimal precision).
 */
type LineCoefficientsBD = [BigDecimal, BigDecimal, BigDecimal];


// Constants ----------------------------------------------------------------------


/** All positive/absolute orthogonal vectors. */
const VECTORS_ORTHOGONAL: Coords[] = [[1n,0n],[0n,1n]];
/** All positive/absolute diagonal vectors. */
const VECTORS_DIAGONAL: Coords[] = [[1n,1n],[1n,-1n]];
/** The positive/absolute knightrider hippogonals. */
const VECTORS_HIPPOGONAL: Coords[] = [[1n,2n],[1n,-2n],[2n,1n],[2n,-1n]];


const ZERO: BigDecimal = bd.FromBigInt(0n);
const ONE: BigDecimal = bd.FromBigInt(1n);


// Construction ----------------------------------------------------------------------


/**
 * Returns the key string of the coordinates: [dx,dy] => 'dx,dy'
 */
function getKeyFromVec2(vec2: Vec2): Vec2Key {
	return `${vec2[0]},${vec2[1]}`;
}

/**
 * Returns the vector from the Vec2Key: 'dx,dy' => [dx,dy]
 */
function getVec2FromKey(vec2Key: Vec2Key): Vec2 {
	return vec2Key.split(',').map(BigInt) as Vec2;
}

/**
 * Converts a bigint vector to javascript doubles. 
 */
function convertVectorToDoubles(vec2: Vec2): DoubleCoords {
	return [Number(vec2[0]), Number(vec2[1])];
}

/**
 * Calculates the general form coefficients (A, B, C) of a line given a point and a direction vector.
 */
function getLineGeneralFormFromCoordsAndVec(coords: Coords, vector: Vec2): LineCoefficients {
	// General form: Ax + By + C = 0
	const A = vector[1];
	const B = -vector[0];
	const C = vector[0] * coords[1] - vector[1] * coords[0];

	return [A, B, C];
}

/**
 * {@link getLineGeneralFormFromCoordsAndVec} but for BigDecimal coordinates.
 */
function getLineGeneralFormFromCoordsAndVecBD(coords: BDCoords, vector: Vec2): LineCoefficientsBD {
	const vectorBD = bd.FromCoords(vector);

	// General form: Ax + By + C = 0
	const A: BigDecimal = bd.clone(vectorBD[1]);
	const B: BigDecimal = bd.negate(vectorBD[0]);
	// vector[0] * coords[1] - vector[1] * coords[0]
	const C: BigDecimal = bd.subtract(bd.multiply_fixed(vectorBD[0], coords[1]), bd.multiply_fixed(vectorBD[1], coords[0]));

	return [A, B, C];
}

/**
 * Calculates the general form of a line (Ax + By + C = 0) given two points on the line.
 * Handles both regular and vertical lines.
 */
function getLineGeneralFormFrom2Coords(coords1: Coords, coords2: Coords): LineCoefficients {
	// Handle the case of a vertical line (infinite slope)
	// The line equation is x = x1, which in general form is: 1*x + 0*y - x1 = 0
	if (coords1[0] === coords2[0]) return [1n, 0n, -coords1[0]];

	// // Calculate the slope (m)
	// const m = (coords2[1] - coords1[1]) / (coords2[0] - coords1[0]);

	// // General form coefficients: A = m, B = -1, and C = y1 - m * x1
	// const A = m;
	// const B = -1n;
	// const C = coords1[1] - m * coords1[0];

	// To avoid division and floating-point/truncation issues, we use the cross-multiplication method.
	// The equation (y - y1)(x2 - x1) = (x - x1)(y2 - y1) is rearranged to Ax + By + C = 0.
	const A = coords2[1] - coords1[1]; // y2 - y1
	const B = coords1[0] - coords2[0]; // x1 - x2
	const C = coords2[0] * coords1[1] - coords1[0] * coords2[1]; // x2*y1 - x1*y2

	return [A, B, C];
}

/**
 * {@link getLineGeneralFormFrom2Coords} but for BigDecimal coordinates.
 */
function getLineGeneralFormFrom2CoordsBD(coords1: BDCoords, coords2: BDCoords): LineCoefficientsBD {
	// Handle the case of a vertical line (infinite slope)
	// The line equation is x = x1, which in general form is: 1*x + 0*y - x1 = 0
	if (bd.areEqual(coords1[0], coords2[0])) return [ONE, ZERO, bd.negate(coords1[0])];

	// To avoid division and floating-point/truncation issues, we use the cross-multiplication method.
	// The equation (y - y1)(x2 - x1) = (x - x1)(y2 - y1) is rearranged to Ax + By + C = 0.
	const A = bd.subtract(coords2[1], coords1[1]); // y2 - y1
	const B = bd.subtract(coords1[0], coords2[0]); // x1 - x2
	const C = bd.subtract(bd.multiply_fixed(coords2[0], coords1[1]), bd.multiply_fixed(coords1[0], coords2[1])); // x2*y1 - x1*y2

	return [A, B, C];
}

/**
 * Upgrades bigint line coefficients [A, B, C] to BigDecimals.
 */
function convertCoeficcientsToBD(line: LineCoefficients): LineCoefficientsBD {
	return [
		bd.FromBigInt(line[0]),
		bd.FromBigInt(line[1]),
		bd.FromBigInt(line[2]),
	];
}

/**
 * Calculates the vector between 2 points.
 */
function calculateVectorFromPoints(start: Coords, end: Coords): Vec2 {
	return [end[0] - start[0], end[1] - start[1]];
}

/**
 * Calculates the vector between 2 points.
 */
function calculateVectorFromBDPoints(start: BDCoords, end: BDCoords): BDCoords {
	return [bd.subtract(end[0], start[0]), bd.subtract(end[1], start[1])];
}

/**
 * Calculates the C coefficient of a line in general form (Ax + By + C = 0) 
 * given a point (coords) and a direction vector (vector).
 * 
 * Step size here is unimportant, but the slope **is**.
 * This value will be unique for every line that *has the same slope*, but different positions.
 */
function getLineCFromCoordsAndVec(coords: Coords, vector: Vec2): bigint {
	return vector[0] * coords[1] - vector[1] * coords[0];
}

/**
 * {@link getLineCFromCoordsAndVec} but for BigDecimal coordinates.
 */
function getLineCFromCoordsAndVecBD(coords: BDCoords, vector: BDCoords): BigDecimal {
	// Coors first since they are likely higher precision.
	return bd.subtract(bd.multiply_fixed(coords[1], vector[0]), bd.multiply_fixed(coords[0], vector[1]));
}


// Operations -----------------------------------------------------------------------------


/**
 * Compares two lines in general form to see if they are equal/coincident.
 * Two lines are considered equal if their coefficients are proportional.
 * @param line1 - The first line in general form [A1, B1, C1]
 * @param line2 - The second line in general form [A2, B2, C2]
 * @returns true if the lines are equal, false otherwise
 */
function areLinesInGeneralFormEqual(line1: LineCoefficients, line2: LineCoefficients): boolean {
	const [A1, B1, C1] = line1;
	const [A2, B2, C2] = line2;

	// Check if the ratios of the coefficients are equal (proportional)
	// Avoid division by zero by checking the relationship with multiplication
	return (A1 * B2 === A2 * B1) && (A1 * C2 === A2 * C1) && (B1 * C2 === B2 * C1);
}

/**
 * Calculates the X and Y components of a unit vector given an angle in radians.
 * @param theta - The angle in radians.
 * @returns A tuple containing the X and Y components, both between -1 and 1.
 */
function getXYComponents_FromAngle(theta: number): DoubleCoords {
	return [Math.cos(theta), Math.sin(theta)]; // When hypotenuse is 1.0
}

/**
 * Computes the dot product of two 2D vectors.
 * WILL BE POSITIVE if they roughly point in the same direction.
 */
function dotProduct(v1: Vec2, v2: Vec2): bigint {
	return v1[0] * v2[0] + v1[1] * v2[1];
}

/**
 * Computes the dot product of two 2D vectors.
 * WILL BE POSITIVE if they roughly point in the same direction.
 */
function dotProductBD(v1: BDCoords, v2: BDCoords): BigDecimal {
	return bd.add(bd.multiply_fixed(v1[0], v2[0]), bd.multiply_fixed(v1[1], v2[1]));
}

/**
 * Negates the provided length-2 vector so it points in the opposite direction
 * 
 * Non-mutating. Returns a new vector.
 */
function negateVector(vec2: Vec2): Vec2 {
	return [-vec2[0],-vec2[1]];
}

/**
 * Negates the provided length-2 BigDecimal vector so it points in the opposite direction
 * 
 * Non-mutating. Returns a new vector.
 */
function negateBDVector(vec2: BDCoords): BDCoords {
	return [bd.negate(vec2[0]), bd.negate(vec2[1])];
}

/**
 * Returns the absolute value of the provided vector.
 * In the context of our game, positive vectors always point to the right,
 * and if they are vertical then they always point up.
 */
function absVector(vec2: Vec2): Vec2 {
	if (vec2[0] < 0n || vec2[0] === 0n && vec2[1] < 0n) return negateVector(vec2);
	else return vec2;
}

/**
 * Normalizes a vector to its smallest possible integer components while preserving its direction.
 */
function normalizeVector(vec2: Vec2): Vec2 {
	// Calculate the GCD of all the components in the vector.
	const gcd = bimath.GCD(vec2[0], vec2[1]);

	// If the GCD is 0, it means all elements were 0
	if (gcd === 0n) return [0n, 0n];
    
	// Divide each component by the GCD to get the smallest integer representation.
	return [vec2[0] / gcd, vec2[1] / gcd];
}

/**
 * Calculates the normal (perpendicular) vector of a given 2D vector.
 */
function getPerpendicularVector(vec2: Vec2): Vec2 {
	return [-vec2[1], vec2[0]];
}

/**
 * Converts an angle in degrees to radians
 */
function degreesToRadians(angleDegrees: number): number {
	return angleDegrees * (Math.PI / 180);
}


// Distance Calculation ----------------------------------------------------------------------------


/**
 * Returns the euclidean (hypotenuse) distance between 2 bigint points.
 */
function euclideanDistance(point1: Coords, point2: Coords): BigDecimal {
	const point1BD: BDCoords = bd.FromCoords(point1);
	const point2BD: BDCoords = bd.FromCoords(point2);
	return euclideanDistanceBD(point1BD, point2BD);
}

/**
 * Returns the euclidean (hypotenuse) distance between 2 BigDecimal points.
 */
function euclideanDistanceBD(point1: BDCoords, point2: BDCoords): BigDecimal {
	return bd.hypot(bd.subtract(point2[0], point1[0]), bd.subtract(point2[1], point1[1]));
}

/**
 * Returns the euclidean (hypotenuse) distance between 2 javascript double coordinates.
 */
function euclideanDistanceDoubles(point1: DoubleCoords, point2: DoubleCoords): number {
	return Math.hypot(point2[0] - point1[0], point2[1] - point1[1]);
}

/**
 * Returns the manhatten distance between 2 points.
 * This is the sum of the distances between the points' x distance and y distance.
 * This is often the distance of roads, because you can't move diagonally.
 */
function manhattanDistance(point1: Coords, point2: Coords): bigint {
	return bimath.abs(point2[0] - point1[0]) + bimath.abs(point2[1] - point1[1]);
}

/**
 * Returns the chebyshev distance between 2 points.
 * This is the maximum between the points' x distance and y distance.
 * This is often used for chess pieces, because moving
 * diagonally 1 is the same distance as moving orthogonally one.
 */
function chebyshevDistance(point1: Coords, point2: Coords): bigint {
	return bimath.max(bimath.abs(point2[0] - point1[0]), bimath.abs(point2[1] - point1[1]));
}

/**
 * {@link chebyshevDistance} but for BigDecimal coordinates.
 */
function chebyshevDistanceBD(point1: BDCoords, point2: BDCoords): BigDecimal {
	return bd.max(bd.abs(bd.subtract(point2[0], point1[0])), bd.abs(bd.subtract(point2[1], point1[1])));
}

/**
 * {@link chebyshevDistance} but for javascript numbers (doubles).
 */
function chebyshevDistanceDoubles(point1: DoubleCoords, point2: DoubleCoords): number {
	return Math.max(Math.abs(point2[0] - point1[0]), Math.abs(point2[1] - point1[1]));
}


// Exports -------------------------------------------------------------


export default {
	// Constants
	VECTORS_ORTHOGONAL,
	VECTORS_DIAGONAL,
	VECTORS_HIPPOGONAL,

	// Construction
	getKeyFromVec2,
	getVec2FromKey,
	convertVectorToDoubles,
	getLineGeneralFormFromCoordsAndVec,
	getLineGeneralFormFromCoordsAndVecBD,
	getLineGeneralFormFrom2Coords,
	getLineGeneralFormFrom2CoordsBD,
	convertCoeficcientsToBD,
	calculateVectorFromPoints,
	calculateVectorFromBDPoints,
	getLineCFromCoordsAndVec,
	getLineCFromCoordsAndVecBD,

	// Operations
	areLinesInGeneralFormEqual,
	getXYComponents_FromAngle,
	dotProduct,
	dotProductBD,
	negateVector,
	negateBDVector,
	absVector,
	normalizeVector,
	getPerpendicularVector,
	degreesToRadians,

	// Distance Calculation
	euclideanDistance,
	euclideanDistanceBD,
	euclideanDistanceDoubles,
	manhattanDistance,
	chebyshevDistance,
	chebyshevDistanceBD,
	chebyshevDistanceDoubles,
};

export type {
	Vec2,
	Vec2Key,
	Vec3,
	Ray,
	LineCoefficients,
	LineCoefficientsBD,
};