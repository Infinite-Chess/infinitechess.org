
// src/client/scripts/esm/util/math/geometry.ts

/**
 * This script contains methods for performing geometric calculations,
 * such as calculating intersections, and distances.
 */

import type { BoundingBox, BoundingBoxBD } from "./bounds.js";

import coordutil, { BDCoords, Coords } from "../../chess/util/coordutil.js";
import bd, { BigDecimal } from "../bigdecimal/bigdecimal.js";
import vectors, { LineCoefficients, LineCoefficientsBD, Ray, Vec2 } from "./vectors.js";
import bounds from "./bounds.js";



// Type Definitions -----------------------------------------------------------


/** The form of the intersection points returned by {@link findLineBoxIntersections}. */
type IntersectionPoint = {
	/** The actual intersection point */
	coords: BDCoords;
	/**
	 * True if the dot product of the direction vector and the vector to the intersection point is positive.
	 * This tells us if the intersection is in the direction of the vector, or the opposite way.
	 */
	positiveDotProduct: boolean;
}


// Constants -----------------------------------------------------------


const ZERO = bd.FromBigInt(0n);
const ONE = bd.FromBigInt(1n);


// Operations -----------------------------------------------------------


/**
 * Finds the intersection of two lines in general form.
 * [x, y] or undefined if there is no intersection (or infinite intersections).
 * 
 * PERFECT INTEGER PRECISION. If the intersection lies on a perfect integer point,
 * there will be no floating point innaccuracies.
 * If however the intersection lies on a non-integer point, and the BigDecimal
 * can't represent it perfectly in binary, there will be floating point innaccuracy.
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
 * {@link calcIntersectionPointOfLines}, but for BigDecimal lines (requiring decimal precision).
 */
function calcIntersectionPointOfLinesBD(A1: BigDecimal, B1: BigDecimal, C1: BigDecimal, A2: BigDecimal, B2: BigDecimal, C2: BigDecimal): BDCoords | undefined {
	const determinant = bd.subtract(bd.multiply_fixed(A1, B2), bd.multiply_fixed(A2, B1));
	if (bd.areEqual(determinant, ZERO)) return undefined; // Lines are parallel or identical

	function determineAxis(dividend: BigDecimal) {
		return bd.divide_fixed(dividend, determinant);
	}

	// Calculate the intersection point
	const x = determineAxis(bd.subtract(bd.multiply_fixed(C2, B1), bd.multiply_fixed(C1, B2)));
	const y = determineAxis(bd.subtract(bd.multiply_fixed(A2, C1), bd.multiply_fixed(A1, C2)));

	return [x, y];
}

/**
 * Calculates the intersection point of a NON-VERTICAL line with a vertical one!
 */
function intersectLineAndVerticalLine(A1: bigint, B1: bigint, C1: bigint, x: bigint): BDCoords {
	// The known coordinate is x, its coefficient is A1.
	// We are solving for y, its coefficient is B1.
	const intersectionY = solveForUnknownAxis(A1, B1, C1, x);
	const intersectionX = bd.FromBigInt(x);

	return [intersectionX, intersectionY];
}

/**
 * Calculates the intersection point of a NON-HORIZONTAL line with a horizontal one!
 * 
 */
function intersectLineAndHorizontalLine(A1: bigint, B1: bigint, C1: bigint, y: bigint): BDCoords {
	// The known coordinate is y, its coefficient is B1.
	// We are solving for x, its coefficient is A1.
	const intersectionX = solveForUnknownAxis(B1, A1, C1, y);
	const intersectionY = bd.FromBigInt(y);

	return [intersectionX, intersectionY];
}

/**
 * [Helper] Solves for one coordinate of a line (Ax + By + C = 0) when the other is known.
 * Generalizes the formula: unknown = -(knownCoeff * knownVal + C) / unknownCoeff
 * @param knownAxisCoeff - The coefficient (A or B) corresponding to the known coordinate.
 * @param unknownAxisCoeff - The coefficient (A or B) for the coordinate we are solving for.
 * @param C - The C coefficient of the line.
 * @param knownValue - The value of the known coordinate (e.g., the 'x' of a vertical line).
 * @returns The calculated value of the unknown coordinate as a BigDecimal.
 */
function solveForUnknownAxis(knownAxisCoeff: bigint, unknownAxisCoeff: bigint, C: bigint, knownValue: bigint): BigDecimal {
	// This should not happen if the "non-vertical" or "non-horizontal" constraints are met.
	if (unknownAxisCoeff === 0n) throw new Error("Cannot solve for axis, as the divisor (unknownAxisCoeff) is zero.");

	// Calculate the numerator using perfect BigInt arithmetic.
	const numerator = -(knownAxisCoeff * knownValue + C);

	// Convert to BigDecimal and perform the single, final division.
	return bd.divide_fixed(bd.FromBigInt(numerator), bd.FromBigInt(unknownAxisCoeff));
}

/**
 * Calculates the intersection point of two line SEGMENTS (not rays or infinite lines).
 * Returns undefined if there is none, or there's infinite (colinear).
 * 
 * THE REASON WE TAKE THE COEFFICIENTS as arguments instead of calculating them
 * on the fly, is because the start and end segment points MAY HAVE FLOATING POINT IMPRECISION,
 * which would bleed into coefficient imprecision, thus imprecise intersection points.
 * By accepting the coefficients as arguments, they retain maximum precision.
 * @param line1Coefficients Coefficients [A,B,C] of segment 1's infinite line
 * @param s1p1 Start point of segment 1
 * @param s1p2 End point of segment 1
 * @param line2Coefficients Coefficients [A,B,C] of segment 2's infinite line
 * @param s2p1 Start point of segment 2
 * @returns The intersection Coords if they intersect, otherwise undefined.
 */
function intersectLineSegments(line1Coefficients: LineCoefficients, s1p1: BDCoords, s1p2: BDCoords, line2Coefficients: LineCoefficients, s2p1: BDCoords, s2p2: BDCoords): BDCoords | undefined {
	// 1. Calculate intersection of the infinite lines
	const intersectionPoint: BDCoords | undefined = calcIntersectionPointOfLines(...line1Coefficients, ...line2Coefficients);

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
function isPointOnSegment(point: BDCoords, segStart: BDCoords, segEnd: BDCoords): boolean {

	const minSegX = bd.min(segStart[0], segEnd[0]);
	const maxSegX = bd.max(segStart[0], segEnd[0]);
	const minSegY = bd.min(segStart[1], segEnd[1]);
	const maxSegY = bd.max(segStart[1], segEnd[1]);

	// Check if point is within the bounding box of the segment
	const withinX = bd.compare(point[0], minSegX) >= 0 && bd.compare(point[0], maxSegX) <= 0;
	const withinY = bd.compare(point[1], minSegY) >= 0 && bd.compare(point[1], maxSegY) <= 0;

	return withinX && withinY;
}

/**
 * Calculates the intersection point of an infinite line (in general form) and a line segment.
 * Returns undefined if there is no intersection, the intersection point lies
 * outside the segment, or if the line and segment are collinear/parallel.
 * @param lineCoefficients The coefficients [A,B,C] of the infinite line.
 * @param segmentCoefficients The coefficients [A,B,C] of the line containing the segment.
 * @param segP1 Start point of the segment
 * @param segP2 End point of the segment
 * @returns The intersection Coords if they intersect ON the segment, otherwise undefined.
 */
function intersectLineAndSegment(lineCoefficients: LineCoefficientsBD, segmentCoefficients: LineCoefficients, segP1: BDCoords, segP2: BDCoords): BDCoords | undefined {
	// 1. Convert the segment coefficients to BigDecimal
	const segmentCoefficientsBD = vectors.convertCoeficcientsToBD(segmentCoefficients);

	// 2. Calculate intersection of the two infinite lines
	// Uses the provided function calcIntersectionPointOfLines
	const intersectionPoint = calcIntersectionPointOfLinesBD(...lineCoefficients, ...segmentCoefficientsBD);

	// 3. Handle no intersection (parallel) or collinear lines.
	// calcIntersectionPointOfLines returns undefined if determinant is 0.
	if (intersectionPoint === undefined) return undefined;

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
 * @param segP1 Start point of the segment. PERFECT integer.
 * @param segP2 End point of the segment. PERFECT integer.
 * @returns The intersection Coords if they intersect ON the segment and ON the ray, otherwise undefined.
 */
function intersectRayAndSegment(ray: Ray, segP1: Coords, segP2: Coords): BDCoords | undefined {
	// 1. Get general form for the infinite line containing the segment.
	// PERFECT integers => No floating point imprecision.
	const segmentCoeffs = vectors.getLineGeneralFormFrom2Coords(segP1, segP2); 

	// 2. Calculate intersection of the two infinite lines.
	const intersectionPoint = calcIntersectionPointOfLines(...ray.line, ...segmentCoeffs);

	// 3. Handle no unique intersection (parallel or collinear lines).
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
		const vectorToOppositePoint = vectors.calculateVectorFromPoints(ray.start, oppositePoint);
		const dotProd = vectors.dotProduct(ray.vector, vectorToOppositePoint);
		if (dotProd > 0) return undefined; // The ray points towards the opposite end of the segment, so no unique intersection.
		else return bd.FromCoords(ray.start); // The intersection point is the ray's start.
	}

	// 4. Check if the calculated intersection point lies on the actual segment.
	if (!isPointOnSegment(intersectionPoint, bd.FromCoords(segP1), bd.FromCoords(segP2))) return undefined; // Intersection point is not within the segment bounds.

	// 5. Check if the intersection point lies on the ray (not "behind" its start).
	// Calculate vector from ray start to intersection.
	const rayStartBD = bd.FromCoords(ray.start);
	const vectorToIntersection = vectors.calculateVectorFromBDPoints(rayStartBD, intersectionPoint);

	// Calculate dot product of ray's direction vector and the vector to the intersection.
	const rayVecBD = bd.FromCoords(ray.vector);
	const dotProd = vectors.dotProductBD(rayVecBD, vectorToIntersection);

	if (bd.compare(dotProd, ZERO) < 0) return undefined; // Dot product is negative, meaning the intersection point is behind the ray's start.

	// 6. If all checks pass, the intersection point is valid for both ray and segment.
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
	const vectorToIntersection1 = vectors.calculateVectorFromBDPoints(bd.FromCoords(ray1.start), intersectionPoint);
	// Dot product of ray1's direction vector and vectorToIntersection1
	const dotProd1 = vectors.dotProductBD(bd.FromCoords(ray1.vector), vectorToIntersection1);

	if (bd.compare(dotProd1, ZERO) < 0) return undefined; // The intersection point is "behind" the start of ray1.

	// 4. Check if the intersection point lies on the second ray (similarly).
	const vectorToIntersection2 = vectors.calculateVectorFromBDPoints(bd.FromCoords(ray2.start), intersectionPoint);
	const dotProd2 = vectors.dotProductBD(bd.FromCoords(ray2.vector), vectorToIntersection2);

	if (bd.compare(dotProd2, ZERO) < 0) return undefined; // The intersection point is "behind" the start of ray2.

	// 5. If both checks pass, the intersection point is on both rays.
	return intersectionPoint;
}


/**
 * Returns the point on the line SEGMENT that is nearest to the given point.
 * 
 * @param segP1 - The starting point of the line segment.
 * @param segP2 - The ending point of the line segment.
 * @param point - The point to find the nearest point on the line segment to.
 * @returns An object containing the properties `coords`, which is the closest point on the segment,
 *          and `distance` to that point.
 */
function closestPointOnLineSegment(segmentCoeffs: LineCoefficients, segP1: BDCoords, segP2: BDCoords, point: BDCoords): { coords: BDCoords, distance: BigDecimal } {

	const perpendicularCoeffs = vectors.getPerpendicularLine(segmentCoeffs, point);

	// Find the intersection of the perpendicular line with the line containing the segment.
	let closestPoint: BDCoords | undefined = intersectLineAndSegment(perpendicularCoeffs, segmentCoeffs, segP1, segP2);

	// If the intersection is undefined, it means it lies outside the segment.
	// So we need to figure out which segment point its CLOSEST to.
	if (closestPoint === undefined) {
		const distToP1 = vectors.chebyshevDistanceBD(point, segP1);
		const distToP2 = vectors.chebyshevDistanceBD(point, segP2);
		if (bd.compare(distToP1, distToP2) < 0) closestPoint = segP1; // p1 is closer
		else closestPoint = segP2; // p2 is closer
	}

	// Calculate the distance from the original point to the closest point on the segment.
	const distance = vectors.euclideanDistanceBD(closestPoint, point);

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
function findCrossSectionalWidthPoints(vector: BDCoords, boundingBox: BoundingBoxBD): [BDCoords, BDCoords] {
	const { left, right, bottom, top } = boundingBox;
	const [dx, dy] = vector;

	// Handle edge case: zero direction vector
	if (bd.areEqual(dx, ZERO) && bd.areEqual(dy, ZERO)) throw new Error("Direction vector cannot be zero.");

	// The normal vector is perpendicular to the viewing vector.
	// We can use this to find the points that are furthest apart on this line.
	const normal: BDCoords = [bd.negate(dy), dx];

	const corners: BDCoords[] = [
        [left, top],     // Top-left
        [right, top],    // Top-right
        [left, bottom],  // Bottom-left
        [right, bottom]  // Bottom-right
    ];

	// Initialize min/max with the projection of the first corner
	let minCorner: BDCoords = corners[0]!;
	let maxCorner: BDCoords = corners[0]!;

	// minCorner[0] * normalBD[0] + minCorner[1] * normalBD[1]
	let minProjection: BigDecimal = bd.add(bd.multiply_fixed(minCorner[0], normal[0]), bd.multiply_fixed(minCorner[1], normal[1]));
	let maxProjection: BigDecimal = minProjection;

	// Iterate through the rest of the corners (from the second one)
	for (let i = 1; i < corners.length; i++) {
		const corner: BDCoords = corners[i]!;

		// Project the corner onto the NORMAL vector using the dot product
		const projection = vectors.dotProductBD(corner, normal);

		if (bd.compare(projection, minProjection) < 0) {
			minProjection = projection;
			minCorner = corner;
		}
		if (bd.compare(projection, maxProjection) > 0) {
			maxProjection = projection;
			maxCorner = corner;
		}
	}

	return [minCorner, maxCorner];
}

/**
 * Rounds the given point to the nearest grid point multiple of the provided gridSize.
 * 
 * For example, a point of [5200,1100] and gridSize of 10000 would yield [10000,0]
 */
function roundPointToNearestGridpoint(point: BDCoords, gridSize: bigint): Coords { // point: [x,y]  gridSize is width of cells, typically 10,000
	// Incurs rounding, but honestly this doesn't need to be exact because it's for graphics.
	const pointBigInt: Coords = bd.coordsToBigInt(point);

	// To round bigints, we add half the gridSize before dividing by it.
	function roundBigintNearestMultiple(value: bigint, multiple: bigint) {
		const halfMultiple = multiple / 2n; // Assumes multiple is positive and divisible by 2.

		// For positives, add half and truncate.
		if (value >= 0n) return ((value + halfMultiple) / multiple) * multiple;
		// For negatives, subtract half and truncate.
		else return ((value - halfMultiple) / multiple) * multiple;
	}

	const nearestX = roundBigintNearestMultiple(pointBigInt[0], gridSize);
	const nearestY = roundBigintNearestMultiple(pointBigInt[1], gridSize);

	return [nearestX, nearestY];
}


/**
 * Finds the intersection points of a line with a bounding box.
 * FLOATING POINT PRECISION. If you need accuracy, use {@link findLineBoxIntersectionsPerfect} instead.
 * @param startCoords - The starting point of the line.
 * @param direction - The direction vector [dx, dy] of the line.
 * @param box - The bounding box the line intersects.
 * @returns An array of intersection points as BDCoords, sorted by distance along the vector.
 */
function findLineBoxIntersections(startCoords: BDCoords, direction: Vec2, box: BoundingBoxBD): IntersectionPoint[] {

	// --- 1. Convert all BigInt inputs to BigDecimal using default precision ---
	const [bd_x0, bd_y0] = startCoords;
	const [bd_dx, bd_dy] = bd.FromCoords(direction);
	
	const { left, right, bottom, top } = box;
    
	const valid_t_values: BigDecimal[] = [];

	// --- 2. Check for intersections with each of the four box edges ---

	// Check vertical edges (left and right)
	if (direction[0] !== 0n) {
		// t = (boundary - x0) / dx
		const t_left = bd.divide_fixed(bd.subtract(left, bd_x0), bd_dx);
		const t_right = bd.divide_fixed(bd.subtract(right, bd_x0), bd_dx);

		// Check if the intersection at t_left is on the edge
		const y_at_left = bd.add(bd.multiply_fixed(t_left, bd_dy), bd_y0);
		if (bd.compare(y_at_left, bottom) >= 0 && bd.compare(y_at_left, top) <= 0) {
			valid_t_values.push(t_left);
		}

		// Check if the intersection at t_right is on the edge
		const y_at_right = bd.add(bd.multiply_fixed(t_right, bd_dy), bd_y0);
		if (bd.compare(y_at_right, bottom) >= 0 && bd.compare(y_at_right, top) <= 0) {
			valid_t_values.push(t_right);
		}
	}

	// Check horizontal edges (bottom and top)
	if (direction[1] !== 0n) {
		// t = (boundary - y0) / dy
		const t_bottom = bd.divide_fixed(bd.subtract(bottom, bd_y0), bd_dy);
		const t_top = bd.divide_fixed(bd.subtract(top, bd_y0), bd_dy);
        
		// Check if the intersection at t_bottom is on the edge
		const x_at_bottom = bd.add(bd.multiply_fixed(t_bottom, bd_dx), bd_x0);
		if (bd.compare(x_at_bottom, left) >= 0 && bd.compare(x_at_bottom, right) <= 0) {
			valid_t_values.push(t_bottom);
		}

		// Check if the intersection at t_top is on the edge
		const x_at_top = bd.add(bd.multiply_fixed(t_top, bd_dx), bd_x0);
		if (bd.compare(x_at_top, left) >= 0 && bd.compare(x_at_top, right) <= 0) {
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
 * Finds the intersection points of an integer line with an integer bounding box.
 * PERFECT INTEGER PRECISION for intersections that lie on integer points.
 * @param startCoords - The starting point of the line.
 * @param direction - The direction vector [dx, dy] of the line.
 * @param box - The bounding box to test if the line intersects.
 * @returns An array of intersection points as BDCoords, sorted by distance along the direction vector.
 */
function findLineBoxIntersectionsInteger(
	startCoords: Coords,
	direction: Vec2,
	box: BoundingBox,
	log = false
) {

	if (log) {
		console.log("\nFinding line box intersections for:");
		console.log("Coords:", startCoords);
		console.log("Vector:", direction);
		console.log("Box:", box);
		console.log('\n');
	}

	// 1. Deconstruct inputs into BigInts for precise integer arithmetic

	const [dx, dy] = direction;
	const boxBD = bounds.castBoundingBoxToBigDecimal(box);

	// 2. Determine the coefficients of the line in general form

	const coeffs = vectors.getLineGeneralFormFromCoordsAndVec(startCoords, direction);

	// 3. Check for intersections with each of the four box edges

	const intersections: BDCoords[] = [];
	
	// Check vertical edges (where x is constant: x = left or x = right)
	if (dx !== 0n) { // A non-zero dx means the line is not vertical and can intersect vertical edges.
		const intersectionLeft = intersectLineAndVerticalLine(...coeffs, box.left);
		const intersectionRight = intersectLineAndVerticalLine(...coeffs, box.right);

		// Now check if the intersection points actually lie ON the segments of the edges.
		if (bd.compare(intersectionLeft[1], boxBD.bottom) >= 0 && bd.compare(intersectionLeft[1], boxBD.top) <= 0) intersections.push(intersectionLeft); // Valid intersection on left edge
		if (bd.compare(intersectionRight[1], boxBD.bottom) >= 0 && bd.compare(intersectionRight[1], boxBD.top) <= 0) intersections.push(intersectionRight); // Valid intersection on right edge
	}

	// Check horizontal edges (where y is constant: y = bottom or y = top)
	if (dy !== 0n) { // A non-zero dy means the line is not horizontal and can intersect horizontal edges.
		const intersectionBottom = intersectLineAndHorizontalLine(...coeffs, box.bottom);
		const intersectionTop = intersectLineAndHorizontalLine(...coeffs, box.top);

		// Now check if the intersection points actually lie ON the segments of the edges.
		if (bd.compare(intersectionBottom[0], boxBD.left) >= 0 && bd.compare(intersectionBottom[0], boxBD.right) <= 0) intersections.push(intersectionBottom); // Valid intersection on bottom edge
		if (bd.compare(intersectionTop[0], boxBD.left) >= 0 && bd.compare(intersectionTop[0], boxBD.right) <= 0) intersections.push(intersectionTop); // Valid intersection on top edge
	}

	// 4. De-duplicate and Sort the valid intersection points

	// De-duplicate points
	const unique_intersections = intersections.filter((v, i, a) => 
		a.findIndex(t => coordutil.areBDCoordsEqual(v, t)) === i
	);

	// Normalize the start coords as if the vector is normalized to the first graph quadrant.
	const startCoordsNorm = coordutil.copyCoords(startCoords);
	if (dx < 0n) startCoordsNorm[0] = -startCoordsNorm[0];
	if (dy < 0n) startCoordsNorm[1] = -startCoordsNorm[1];
	const startCoordsSum = startCoordsNorm[0] + startCoordsNorm[1];

	const intersectionsWithPositiveDotProduct = unique_intersections.map(intersection => {
		// Normalize the intersection as if the vector is normalized.
		const norm = normalizeIntersection(intersection);

		const sum = bd.add(norm[0], norm[1]);

		// If the sum is greater than the startCoords sum, the dot product is positive.
		const positiveDotProduct = bd.compare(sum, bd.FromBigInt(startCoordsSum)) >= 0;
		
		return {
			coords: intersection,
			positiveDotProduct
		};
	});

	// Sort by distance along the direction vector
	intersectionsWithPositiveDotProduct.sort((a, b) => {
		// Normalize the intersection as if the vector is normalized.
		const normA = normalizeIntersection(a.coords);
		const normB = normalizeIntersection(b.coords);

		const ASum = bd.add(normA[0], normA[1]);
		const BSum = bd.add(normB[0], normB[1]);

		// Whichever is greater is further along the direction vector.
		return bd.compare(ASum, BSum);
	});

	function normalizeIntersection(intersection: BDCoords): BDCoords {
		const normalizedIntersection = coordutil.copyBDCoords(intersection);
		if (dx < 0n) normalizedIntersection[0] = bd.negate(normalizedIntersection[0]);
		if (dy < 0n) normalizedIntersection[1] = bd.negate(normalizedIntersection[1]);
		return normalizedIntersection;
	}

	if (log) {
		for (const i of intersectionsWithPositiveDotProduct) {
			console.log("Coordinates of intersection:", coordutil.stringifyBDCoords(i.coords));
			console.log("Positive dot product?", i.positiveDotProduct);
		}
	}

	return intersectionsWithPositiveDotProduct;
}

// Test cases

// const testBox: BoundingBox = { left: -10n, right: 10n, bottom: -5n, top: 5n };
// const testCoords: Coords = [2n, -9n];
// const textVector: Vec2 = [-3n, 1n];

// findLineBoxIntersectionsInteger2(testCoords, textVector, testBox, true);


// Exports ----------------------------------------------------------------------


export default {
	// Operations
	calcIntersectionPointOfLines,
	calcIntersectionPointOfLinesBD,
	intersectLineSegments,
	intersectLineAndSegment,
	intersectRayAndSegment,
	intersectRays,
	closestPointOnLineSegment,
	findCrossSectionalWidthPoints,
	roundPointToNearestGridpoint,
	findLineBoxIntersections,
	findLineBoxIntersectionsInteger,
};

export type {
	IntersectionPoint,
};