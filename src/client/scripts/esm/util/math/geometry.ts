
// src/client/scripts/esm/util/math/geometry.ts

/**
 * This script contains methods for performing geometric calculations,
 * such as calculating intersections, and distances.
 */


import coordutil, { BDCoords, Coords } from "../../chess/util/coordutil";
import bd, { BigDecimal } from "../bigdecimal/bigdecimal";
import vectors, { Ray, Vec2 } from "./vectors";

import type { BoundingBoxBD } from "./bounds";


// Constants -----------------------------------------------------------


const ZERO = bd.FromBigInt(0n);
const ONE = bd.FromBigInt(1n);


// Operations -----------------------------------------------------------


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
	const [segA, segB, segC] = vectors.getLineGeneralFormFrom2Coords(segP1, segP2);

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
	const [lineA_seg, lineB_seg, lineC_seg] = vectors.getLineGeneralFormFrom2Coords(segP1, segP2);

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
		const vectorToOppositePoint = vectors.calculateVectorFromPoints(ray.start, oppositePoint);
		const dotProd = vectors.dotProduct(ray.vector, vectorToOppositePoint);
		if (dotProd > 0) return undefined; // The ray points towards the opposite end of the segment, so no unique intersection.
		else return bd.FromCoords(ray.start); // The intersection point is the ray's start.
	}

	// 5. Check if the calculated intersection point lies on the actual segment.
	if (!isPointOnSegment(intersectionPoint, segP1, segP2)) return undefined; // Intersection point is not within the segment bounds.

	// 6. Check if the intersection point lies on the ray (not "behind" its start).
	// Calculate vector from ray start to intersection.
	const rayStartBD = bd.FromCoords(ray.start);
	const vectorToIntersection = vectors.calculateVectorFromBDPoints(rayStartBD, intersectionPoint);

	// Calculate dot product of ray's direction vector and the vector to the intersection.
	const rayVecBD = bd.FromCoords(ray.vector);
	const dotProd = vectors.dotProductBD(rayVecBD, vectorToIntersection);

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
	const vectorToIntersection1 = vectors.calculateVectorFromBDPoints(ray1StartBD, intersectionPoint);
	// Dot product of ray1's direction vector and vectorToIntersection1
	const ray1VecBD = bd.FromCoords(ray1.vector);
	const dotProd1 = vectors.dotProductBD(ray1VecBD, vectorToIntersection1);

	if (bd.compare(dotProd1, ZERO) < 0) return undefined; // The intersection point is "behind" the start of ray1.

	// 4. Check if the intersection point lies on the second ray (similarly).
	const ray2StartBD = bd.FromCoords(ray2.start);
	const vectorToIntersection2 = vectors.calculateVectorFromBDPoints(ray2StartBD, intersectionPoint);
	const ray2VecBD = bd.FromCoords(ray2.vector);
	const dotProd2 = vectors.dotProductBD(ray2VecBD, vectorToIntersection2);

	if (bd.compare(dotProd2, ZERO) < 0) return undefined; // The intersection point is "behind" the start of ray2.

	// 5. If both checks pass, the intersection point is on both rays.
	return intersectionPoint;
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
		const distance = vectors.euclideanDistanceBD(lineStartBD, point);
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
 * @param startCoords - The starting point of the line.
 * @param direction - The direction vector [dx, dy] of the line.
 * @param box - The bounding box the line intersects.
 * @returns An array of intersection points as BDCoords, sorted by distance along the vector.
 */
function findLineBoxIntersections(startCoords: Coords, direction: Vec2, box: BoundingBoxBD): { coords: BDCoords; positiveDotProduct: boolean }[] {

	// --- 1. Convert all BigInt inputs to BigDecimal using default precision ---
	const [bd_x0, bd_y0] = bd.FromCoords(startCoords);
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
		const x_at_top = bd.add(bd.multiply_fixed(t_top, bd_dy), bd_x0);
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

// Exports -----------------------------------------------------------

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
};