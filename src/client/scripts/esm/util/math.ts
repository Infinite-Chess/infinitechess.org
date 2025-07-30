
// src/client/scripts/esm/util/math.ts

/**
 * This script contains many generalized mathematical operations that
 * SEVERAL scripts use.
 */


import coordutil from "../chess/util/coordutil.js";
import bd, { BigDecimal } from "./bigdecimal/bigdecimal.js";

import type { BDCoords, Coords, DoubleCoords } from "../chess/util/coordutil.js";
import bimath from "./bigdecimal/bimath.js";


// Type Definitions ------------------------------------------------------------------


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

/** A color in a length-4 array: `[r,g,b,a]` */
type Color = [number,number,number,number];


// Constants ------------------------------------------------------------------------


const ZERO = bd.FromNumber(0.0);
const ONE = bd.FromNumber(1.0);
const TWO = bd.FromNumber(2.0);


// Geometry -------------------------------------------------------------------------------------------


/**
 * Finds the intersection of two lines in general form.
 * [x, y] or undefined if there is no intersection (or infinite intersections).
 */
function calcIntersectionPointOfLines(A1: bigint, B1: bigint, C1: bigint, A2: bigint, B2: bigint, C2: bigint): BDCoords | undefined {

	const determinant = A1 * B2 - A2 * B1;
	if (determinant === 0n) return undefined; // Lines are parallel or identical

	const determinantBD = bd.FromBigInt(determinant);

	function determineAxis(dividend: bigint) {
		const dividendBD = bd.FromBigInt(dividend);
		return bd.divide_fixed(dividendBD, determinantBD);
	}

	// Calculate the intersection point
	const x = determineAxis(C2 * B1 - C1 * B2);
	const y = determineAxis(A2 * C1 - A1 * C2);

	return [x, y];
}

/**
 * Calculates the intersection point of two line SEGMENTS (not rays or infinite lines).
 * Returns undefined if there is none, or there's infinite (colinear).
 * 
 * THE REASON WE TAKE THE COEFFICIENTS as arguments instead of calculating them
 * on the fly, is because the start and end segment points MAY HAVE FLOATING POINT IMPRECISION,
 * which would bleed into coefficient imprecision, thus imprecise intersection points.
 * By accepting the coefficients as arguments, they retain maximum precision.
 * @param A1 Coefficient A of segment 1's line (Ax + By + C = 0)
 * @param B1 Coefficient B of segment 1's line
 * @param C1 Coefficient C of segment 1's line
 * @param s1p1 Start point of segment 1
 * @param s1p2 End point of segment 1
 * @param A2 Coefficient A of segment 2's line (Ax + By + C = 0)
 * @param B2 Coefficient B of segment 2's line
 * @param C2 Coefficient C of segment 2's line
 * @param s2p1 Start point of segment 2
 * @returns The intersection Coords if they intersect, otherwise undefined.
 */
function intersectLineSegments(A1: bigint, B1: bigint, C1: bigint, s1p1: Coords, s1p2: Coords, A2: bigint, B2: bigint, C2: bigint, s2p1: Coords, s2p2: Coords): BDCoords | undefined {
	// 1. Calculate intersection of the infinite lines
	const intersectionPoint: BDCoords | undefined = calcIntersectionPointOfLines(A1, B1, C1, A2, B2, C2);

	if (!intersectionPoint) return undefined; // Lines are parallel or collinear.

	// 2. Check if the intersection point lies on both segments
	if (isPointOnSegment(intersectionPoint, s1p1, s1p2) && isPointOnSegment(intersectionPoint, s2p1, s2p2)) return intersectionPoint;

	return undefined; // Intersection point is not on one or both segments
}

/**
 * Checks if a point lies on a given line segment.
 * ASSUMES THE POINT IS COLINEAR with the segment's endpoints if checking after finding an intersection of their lines.
 * @param point The point to check.
 * @param segStart The starting point of the segment.
 * @param segEnd The ending point of the segment.
 * @returns True if the point is on the segment, false otherwise.
 */
function isPointOnSegment(point: BDCoords, segStart: Coords, segEnd: Coords): boolean {
	const segStartBD = bd.FromCoords(segStart);
	const segEndBD = bd.FromCoords(segEnd);

	const minSegX = bd.min(segStartBD[0], segEndBD[0]);
	const maxSegX = bd.max(segStartBD[0], segEndBD[0]);
	const minSegY = bd.min(segStartBD[1], segEndBD[1]);
	const maxSegY = bd.max(segStartBD[1], segEndBD[1]);

	// Check if point is within the bounding box of the segment
	const withinX = bd.compare(point[0], minSegX) >= 0 && bd.compare(point[0], maxSegX) <= 0;
	const withinY = bd.compare(point[1], minSegY) >= 0 && bd.compare(point[1], maxSegY) <= 0;

	return withinX && withinY;
}

/**
 * Calculates the intersection point of an infinite line (in general form) and a line segment.
 * Returns undefined if there is no intersection, the intersection point lies
 * outside the segment, or if the line and segment are collinear/parallel.
 * @param A Coefficient A of the infinite line (Ax + By + C = 0)
 * @param B Coefficient B of the infinite line
 * @param C Coefficient C of the infinite line
 * @param segP1 Start point of the segment
 * @param segP2 End point of the segment
 * @returns The intersection Coords if they intersect ON the segment, otherwise undefined.
 */
function intersectLineAndSegment(A: bigint, B: bigint, C: bigint, segP1: Coords, segP2: Coords): BDCoords | undefined {
	// 1. Get general form for the infinite line containing the segment
	const [segA, segB, segC] = getLineGeneralFormFrom2Coords(segP1, segP2);

	// 2. Calculate intersection of the two infinite lines
	// Uses the provided function calcIntersectionPointOfLines
	const intersectionPoint = calcIntersectionPointOfLines(A, B, C, segA, segB, segC);

	// 3. Handle no intersection (parallel) or collinear lines.
	// calcIntersectionPointOfLines returns undefined if determinant is 0.
	if (!intersectionPoint) return undefined;

	// 4. Check if the calculated intersection point lies on the actual segment
	// The point is guaranteed to be collinear with the segment if an intersection was found.
	if (isPointOnSegment(intersectionPoint, segP1, segP2)) return intersectionPoint; // Intersection point is within the segment bounds

	// 5. The intersection point exists but is outside the segment bounds
	return undefined;
}

/**
 * Calculates the intersection point of an infinite ray and a line segment.
 * Returns undefined if there is no intersection, the intersection point lies
 * outside the segment, the intersection point lies "behind" the ray's start,
 * or if the ray's line and segment's line are collinear/parallel without a
 * valid single intersection point on both.
 * @param ray The ray, defined by a starting point and a direction vector.
 * @param segP1 Start point of the segment.
 * @param segP2 End point of the segment.
 * @returns The intersection Coords if they intersect ON the segment and ON the ray, otherwise undefined.
 */
function intersectRayAndSegment(ray: Ray, segP1: Coords, segP2: Coords): BDCoords | undefined {
	// 1. Get general form for the infinite line containing the ray.
	const [lineA_ray, lineB_ray, lineC_ray] = ray.line;

	// 2. Get general form for the infinite line containing the segment.
	const [lineA_seg, lineB_seg, lineC_seg] = getLineGeneralFormFrom2Coords(segP1, segP2);

	// 3. Calculate intersection of the two infinite lines.
	const intersectionPoint = calcIntersectionPointOfLines(lineA_ray, lineB_ray, lineC_ray, lineA_seg, lineB_seg, lineC_seg);

	// 4. Handle no unique intersection (parallel or collinear lines).
	// Be sure to capture the case if the ray starts at one of the segment's endpoints.
	if (!intersectionPoint) {
		// First check if the ray's start lies on the start/end poit of the segment.
		const rayStartIsP1 = coordutil.areCoordsEqual(ray.start, segP1);
		const rayStartIsP2 = coordutil.areCoordsEqual(ray.start, segP2);
		if (rayStartIsP1 || rayStartIsP2) { // Collinear, and ray starts at one of the segment's endpoints
			// This means the lines must be collinear, so we need to check if
			// the ray's direction vector points away from the segment's opposite end (1 intersection),
			// because if it pointed towards the segment's opposite end, it would have infinite intersections.
			if (rayStartIsP1) return getCollinearIntersection(segP2);
			else if (rayStartIsP2) return getCollinearIntersection(segP1);
		}
		return undefined; // Parallel, not collinear, zero intersections.
	}

	function getCollinearIntersection(oppositePoint: Coords): BDCoords | undefined {
		const vectorToOppositePoint = calculateVectorFromPoints(ray.start, oppositePoint);
		const dotProd = dotProduct(ray.vector, vectorToOppositePoint);
		if (dotProd > 0) return undefined; // The ray points towards the opposite end of the segment, so no unique intersection.
		else return bd.FromCoords(ray.start); // The intersection point is the ray's start.
	}

	// 5. Check if the calculated intersection point lies on the actual segment.
	if (!isPointOnSegment(intersectionPoint, segP1, segP2)) return undefined; // Intersection point is not within the segment bounds.

	// 6. Check if the intersection point lies on the ray (not "behind" its start).
	// Calculate vector from ray start to intersection.
	const rayStartBD = bd.FromCoords(ray.start);
	const vectorToIntersection = calculateVectorFromBDPoints(rayStartBD, intersectionPoint);

	// Calculate dot product of ray's direction vector and the vector to the intersection.
	const rayVecBD = bd.FromCoords(ray.vector);
	const dotProd = dotProductBD(rayVecBD, vectorToIntersection);

	if (bd.compare(dotProd, ZERO) < 0) return undefined; // Dot product is negative, meaning the intersection point is behind the ray's start.

	// 7. If all checks pass, the intersection point is valid for both ray and segment.
	return intersectionPoint;
}

/**
 * Calculates the intersection point of two rays.
 * Returns the intersection coordinates if the rays intersect at a single point
 * that lies on both rays (i.e., not "behind" the starting point of either ray).
 * Returns undefined if they are parallel, collinear (resulting in no unique
 * intersection or infinite intersections), or if the intersection point of
 * their containing lines falls outside of one or both rays.
 *
 * @param ray1 The first ray.
 * @param ray2 The second ray.
 * @returns The intersection Coords if they intersect on both rays, otherwise undefined.
 */
function intersectRays(ray1: Ray, ray2: Ray): BDCoords | undefined {
	// 1. Calculate the intersection point of the infinite lines containing the rays.
	const intersectionPoint = calcIntersectionPointOfLines(...ray1.line, ...ray2.line);

	// 2. If the lines are parallel or collinear, they don't have a unique intersection point.
	// calcIntersectionPointOfLines returns undefined in this case.
	if (!intersectionPoint) return undefined; // This covers parallel lines and collinear lines (infinite intersections or no intersection).

	// 3. Check if the intersection point lies on the first ray.
	// This is done by checking if the vector from the ray's start to the intersection point
	// points in the same general direction as the ray's own direction vector.
	// The dot product will be non-negative (>= 0) if this is true.
    
	// Vector from ray1's start to the intersection point
	const ray1StartBD = bd.FromCoords(ray1.start);
	const vectorToIntersection1 = calculateVectorFromBDPoints(ray1StartBD, intersectionPoint);
	// Dot product of ray1's direction vector and vectorToIntersection1
	const ray1VecBD = bd.FromCoords(ray1.vector);
	const dotProd1 = dotProductBD(ray1VecBD, vectorToIntersection1);

	if (bd.compare(dotProd1, ZERO) < 0) return undefined; // The intersection point is "behind" the start of ray1.

	// 4. Check if the intersection point lies on the second ray (similarly).
	const ray2StartBD = bd.FromCoords(ray2.start);
	const vectorToIntersection2 = calculateVectorFromBDPoints(ray2StartBD, intersectionPoint);
	const ray2VecBD = bd.FromCoords(ray2.vector);
	const dotProd2 = dotProductBD(ray2VecBD, vectorToIntersection2);

	if (bd.compare(dotProd2, ZERO) < 0) return undefined; // The intersection point is "behind" the start of ray2.

	// 5. If both checks pass, the intersection point is on both rays.
	return intersectionPoint;
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
 * Calculates the X and Y components of a unit vector given an angle in radians.
 * @param theta - The angle in radians.
 * @returns A tuple containing the X and Y components, both between -1 and 1.
 */
function getXYComponents_FromAngle(theta: number): DoubleCoords {
	return [Math.cos(theta), Math.sin(theta)]; // When hypotenuse is 1.0
}

/**
 * Rounds the given point to the nearest grid point multiple of the provided gridSize.
 * 
 * For example, a point of [5200,1100] and gridSize of 10000 would yield [10000,0]
 */
function roundPointToNearestGridpoint(point: Coords, gridSize: bigint): Coords { // point: [x,y]  gridSize is width of cells, typically 10,000

	// To round bigints, we add half the gridSize before dividing by it.
	function roundBigintNearestMultiple(value: bigint, multiple: bigint) {
		const halfMultiple = multiple / 2n; // Assumes multiple is positive and divisible by 2.

		// For positives, add half and truncate.
		if (value >= 0n) return ((value + halfMultiple) / multiple) * multiple;
		// For negatives, subtract half and truncate.
		else return ((value - halfMultiple) / multiple) * multiple;
	}

	const nearestX = roundBigintNearestMultiple(point[0], gridSize);
	const nearestY = roundBigintNearestMultiple(point[1], gridSize);

	return [nearestX, nearestY];
}

/**
 * Determines if one bounding box (`innerBox`) is entirely contained within another bounding box (`outerBox`).
 */
function boxContainsBox(outerBox: BoundingBox, innerBox: BoundingBox): boolean {
	if (innerBox.left < outerBox.left) return false;
	if (innerBox.right > outerBox.right) return false;
	if (innerBox.bottom < outerBox.bottom) return false;
	if (innerBox.top > outerBox.top) return false;

	return true;
}

/**
 * Returns true if the provided box contains the square coordinate.
 */
function boxContainsSquare(box: BoundingBoxBD, square: BDCoords): boolean {
	if (bd.compare(square[0], box.left) < 0) return false;
	if (bd.compare(square[0], box.right) > 0) return false;
	if (bd.compare(square[1], box.bottom) < 0) return false;
	if (bd.compare(square[1], box.top) > 0) return false;

	return true;
}

/**
 * Calculates the minimum bounding box that contains all the provided coordinates.
 */
function getBoxFromCoordsList(coordsList: Coords[]): BoundingBoxBD {
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

	return castBoundingBoxToBigDecimal(box);
}

function castBoundingBoxToBigDecimal(box: BoundingBox): BoundingBoxBD {
	return {
		left: bd.FromBigInt(box.left),
		right: bd.FromBigInt(box.right),
		bottom: bd.FromBigInt(box.bottom),
		top: bd.FromBigInt(box.top)
	};
}

function castDoubleBoundingBoxToBigDecimal(box: DoubleBoundingBox): BoundingBoxBD {
	return {
		left: bd.FromNumber(box.left),
		right: bd.FromNumber(box.right),
		bottom: bd.FromNumber(box.bottom),
		top: bd.FromNumber(box.top)
	};
}

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

/**
 * Returns the point on the line SEGMENT that is nearest to the given point.
 * @param lineStart - The starting point of the line segment.
 * @param lineEnd - The ending point of the line segment.
 * @param point - The point to find the nearest point on the line segment to.
 * @returns An object containing the properties `coords`, which is the closest point on the segment,
 *          and `distance` to that point.
 */
function closestPointOnLineSegment(lineStart: Coords, lineEnd: Coords, point: BDCoords): { coords: BDCoords, distance: BigDecimal } {
	const lineStartBD = bd.FromCoords(lineStart);

	const dx = lineEnd[0] - lineStart[0];
	const dy = lineEnd[1] - lineStart[1];
	const dxBD = bd.FromBigInt(dx);
	const dyBD = bd.FromBigInt(dy);

	// Calculate the squared length of the segment.
	// If the segment has zero length, the start point is the closest point.
	const lineLengthSquared = dx * dx + dy * dy;
	if (lineLengthSquared === 0n) { // If the segment has zero length, return the start point
		const distance = euclideanDistance(lineStartBD, point);
		return { coords: lineStartBD, distance };
	}
	const lineLengthSquaredBD = bd.FromBigInt(lineLengthSquared);

	// Calculate the projection parameter t.
	// t = dotProduct((point - lineStart), (lineEnd - lineStart)) / lineLengthSquared
	const xDiff = bd.subtract(point[0], lineStartBD[0]);
	const yDiff = bd.subtract(point[1], lineStartBD[1]);
	const addend1 = bd.multiply_fixed(xDiff, dxBD);
	const addend2 = bd.multiply_fixed(yDiff, dyBD);
	const dotProduct = bd.add(addend1, addend2);
	let t = bd.divide_fixed(dotProduct, lineLengthSquaredBD);

	// Clamp t to the range [0, 1] to stay within the segment.
	t = bd.clamp(t, ZERO, ONE);

	// Calculate the coordinates of the closest point on the segment.
	const closestX = bd.add(lineStartBD[0], bd.multiply_fixed(t, dxBD)); // lineStart[0] + t * dx
	const closestY = bd.add(lineStartBD[1], bd.multiply_fixed(t, dyBD)); // lineStart[1] + t * dy
	const closestPoint: BDCoords = [closestX, closestY];

	// Calculate the distance from the original point to the closest point on the segment.
	const distance = euclideanDistance(closestPoint, point);

	return {
		coords: closestPoint,
		distance
	};
}

/**
 * Finds the two corners of a bounding box that define its cross-sectional width
 * when viewed from the direction of a given vector.
 * 
 * If the vector is vertical, then as if we were looking at the box from below,
 * we would return its left/right-most points.
 */
function findCrossSectionalWidthPoints(vector: Vec2, boundingBox: BoundingBox): [Coords, Coords] {
    const { left, right, bottom, top } = boundingBox;
    const [dx, dy] = vector;

    // Handle edge case: zero direction vector
    if (dx === 0n && dy === 0n) throw new Error("Direction vector cannot be zero.");

    // The normal vector is perpendicular to the viewing vector.
	// We can use this to find the points that are furthest apart on this line.
    const normal: Vec2 = [-dy, dx];

    const corners: Coords[] = [
        [left, top],     // Top-left
        [right, top],    // Top-right
        [left, bottom],  // Bottom-left
        [right, bottom]  // Bottom-right
    ];

    // Initialize min/max with the projection of the first corner
    let minCorner: Coords = corners[0]!;
    let maxCorner: Coords = corners[0]!;

    let minProjection = minCorner[0] * normal[0] + minCorner[1] * normal[1];
    let maxProjection = minProjection;

    // Iterate through the rest of the corners (from the second one)
    for (let i = 1; i < corners.length; i++) {
        const corner = corners[i]!;

        // Project the corner onto the NORMAL vector using the dot product
		const projection = dotProduct(corner, normal);

        if (projection < minProjection) {
            minProjection = projection;
            minCorner = corner;
        }
        if (projection > maxProjection) {
            maxProjection = projection;
            maxCorner = corner;
        }
    }

    return [minCorner, maxCorner];
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
 * Finds the intersection points of a line with a bounding box.
 * @param startCoords - The starting point of the line.
 * @param direction - The direction vector [dx, dy] of the line.
 * @param box - The bounding box the line intersects.
 * @returns An array of intersection points as BDCoords, sorted by distance along the vector.
 */
function findLineBoxIntersections(startCoords: Coords, direction: Vec2, box: BoundingBox): { coords: BDCoords; positiveDotProduct: boolean }[] {

    // --- 1. Convert all BigInt inputs to BigDecimal using default precision ---
    const [bd_x0, bd_y0] = bd.FromCoords(startCoords);
    const [bd_dx, bd_dy] = bd.FromCoords(direction);
    const bd_left = bd.FromBigInt(box.left);
    const bd_right = bd.FromBigInt(box.right);
    const bd_bottom = bd.FromBigInt(box.bottom);
    const bd_top = bd.FromBigInt(box.top);
    
    const valid_t_values: BigDecimal[] = [];

    // --- 2. Check for intersections with each of the four box edges ---

    // Check vertical edges (left and right)
    if (direction[0] !== 0n) {
        // t = (boundary - x0) / dx
        const t_left = bd.divide_fixed(bd.subtract(bd_left, bd_x0), bd_dx);
        const t_right = bd.divide_fixed(bd.subtract(bd_right, bd_x0), bd_dx);

        // Check if the intersection at t_left is on the edge
        const y_at_left = bd.add(bd_y0, bd.multiply_fixed(t_left, bd_dy));
        if (bd.compare(y_at_left, bd_bottom) >= 0 && bd.compare(y_at_left, bd_top) <= 0) {
            valid_t_values.push(t_left);
        }

        // Check if the intersection at t_right is on the edge
        const y_at_right = bd.add(bd_y0, bd.multiply_fixed(t_right, bd_dy));
        if (bd.compare(y_at_right, bd_bottom) >= 0 && bd.compare(y_at_right, bd_top) <= 0) {
            valid_t_values.push(t_right);
        }
    }

    // Check horizontal edges (bottom and top)
    if (direction[1] !== 0n) {
        // t = (boundary - y0) / dy
        const t_bottom = bd.divide_fixed(bd.subtract(bd_bottom, bd_y0), bd_dy);
        const t_top = bd.divide_fixed(bd.subtract(bd_top, bd_y0), bd_dy);
        
        // Check if the intersection at t_bottom is on the edge
        const x_at_bottom = bd.add(bd_x0, bd.multiply_fixed(t_bottom, bd_dx));
        if (bd.compare(x_at_bottom, bd_left) >= 0 && bd.compare(x_at_bottom, bd_right) <= 0) {
            valid_t_values.push(t_bottom);
        }

        // Check if the intersection at t_top is on the edge
        const x_at_top = bd.add(bd_x0, bd.multiply_fixed(t_top, bd_dy));
        if (bd.compare(x_at_top, bd_left) >= 0 && bd.compare(x_at_top, bd_right) <= 0) {
            valid_t_values.push(t_top);
        }
    }

    // --- 3. De-duplicate and Sort the valid t-values ---
    
    // De-duplicate points
    const unique_t_values = valid_t_values.filter((v, i, a) => 
        a.findIndex(t => bd.areEqual(v, t)) === i
    );

    // Sort
    unique_t_values.sort((a, b) => bd.compare(a, b));

    // --- 4. Map sorted t-values to the final output format ---
    const ZERO_BD = bd.FromBigInt(0n);

    return unique_t_values.map(t => {
        // Calculate the final intersection coordinates
        const x = bd.add(bd_x0, bd.multiply_fixed(t, bd_dx));
        const y = bd.add(bd_y0, bd.multiply_fixed(t, bd_dy));

        return {
            coords: [x, y],
            // The sign of the dot product is the same as the sign of t.
            positiveDotProduct: bd.compare(t, ZERO_BD) >= 0,
        };
    });
}

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
 * Negates the provided length-2 vector so it points in the opposite direction
 * 
 * Non-destructive. Returns a new vector.
 */
function negateVector(vec2: Vec2): Vec2 {
	return [-vec2[0],-vec2[1]];
}


// Distance Calculation ----------------------------------------------------------------------------


/**
 * Returns the euclidean (hypotenuse) distance between 2 points.
 */
function euclideanDistance(point1: BDCoords, point2: BDCoords): BigDecimal { // [x,y]
	const xDiff = bd.subtract(point2[0], point1[0]);
	const yDiff = bd.subtract(point2[1], point1[1]);
	return bd.hypot(xDiff, yDiff);
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


// Mathematical ---------------------------------------------------------------------------------------


/**
 * Tests if the provided value is a power of 2.
 * 
 * It does this efficiently by using bitwise operations.
 */
function isPowerOfTwo(value: number): boolean {
	return (value & (value - 1)) === 0;
}

/**
 * Clamps a value between a minimum and a maximum value.
 * @param min - The minimum value.
 * @param max - The maximum value.
 * @param value - The value to clamp.
 * @returns The clamped value.
 */
function clamp(value: number, min: number, max: number): number {
	return value < min ? min : value > max ? max : value;
}

/**
 * Converts an angle in degrees to radians
 */
function degreesToRadians(angleDegrees: number): number {
	return angleDegrees * (Math.PI / 180);
}

/**
 * Rounds up the given number to the next lowest power of two.
 * 
 * Time complexity O(1), because bitwise operations are extremely fast.
 * @param num - The number to round up.
 * @returns The nearest power of two greater than or equal to the given number.
 */
function roundUpToNextPowerOf2(num: number): number {
	if (num <= 1) return 1; // Handle edge case for numbers 0 and 1
	num--; // Step 1: Decrease by 1 to handle numbers like 8
	num |= num >> 1; // Step 2: Propagate the most significant bit to the right
	num |= num >> 2;
	num |= num >> 4;
	num |= num >> 8;
	num |= num >> 16; // Additional shift for 32-bit numbers
	return num + 1; // Step 3: Add 1 to get the next power of 2
}

/**
 * Computes the positive modulus of two numbers.
 * @param a - The dividend.
 * @param b - The divisor.
 * @returns The positive remainder of the division.
 */
function posMod(a: number, b: number): number {
	return a - (Math.floor(a / b) * b);
}

/**
 * Starts with `s`, steps it by +-`progress` towards `e`, then returns that number.
 */
function moveTowards(s: number, e: number, progress: number): number {
	return s + Math.sign(e - s) * Math.min(Math.abs(e - s), progress);
}



// Easing Functions --------------------------------------------------------------------------------


/**
 * Applies an ease-in-out interpolation.
 * @param t - The interpolation factor (0 to 1).
 */
function easeInOut(t: number): number {
	return -0.5 * Math.cos(Math.PI * t) + 0.5;
}


// Exports --------------------------------------------------------------------------------------------


export default {
	calcIntersectionPointOfLines,
	intersectLineSegments,
	intersectLineAndSegment,
	intersectRayAndSegment,
	intersectRays,
	getLineGeneralFormFromCoordsAndVec,
	getLineGeneralFormFrom2Coords,
	areLinesInGeneralFormEqual,
	calculateVectorFromPoints,
	getLineCFromCoordsAndVec,
	getXYComponents_FromAngle,
	roundPointToNearestGridpoint,
	boxContainsBox,
	boxContainsSquare,
	getBoxFromCoordsList,
	castBoundingBoxToBigDecimal,
	castDoubleBoundingBoxToBigDecimal,
	expandBoxToContainSquare,
	expandBDBoxToContainSquare,
	mergeBoundingBoxBDs,
	calcCenterOfBoundingBox,
	closestPointOnLineSegment,
	findCrossSectionalWidthPoints,
	dotProduct,
	findLineBoxIntersections,
	getKeyFromVec2,
	getVec2FromKey,
	negateVector,
	euclideanDistance,
	manhattanDistance,
	chebyshevDistance,
	isPowerOfTwo,
	clamp,
	degreesToRadians,
	roundUpToNextPowerOf2,
	posMod,
	moveTowards,
	easeInOut,
};

export type {
	BoundingBox,
	BoundingBoxBD,
	DoubleBoundingBox,
	Vec2,
	Vec2Key,
	Vec3,
	Color,
	Ray,
};