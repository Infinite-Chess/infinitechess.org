
// src/client/scripts/esm/util/math/geometry.ts

/**
 * This script contains methods for performing geometric calculations,
 * such as calculating intersections, and distances.
 */

import type { BoundingBox, BoundingBoxBD } from "./bounds.js";

import bimath from "../bigdecimal/bimath.js";
import coordutil, { BDCoords, Coords } from "../../chess/util/coordutil.js";
import bd, { BigDecimal } from "../bigdecimal/bigdecimal.js";
import vectors, { LineCoefficients, LineCoefficientsBD, Ray, Vec2 } from "./vectors.js";



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
 * @param A Coefficient A of the infinite line (Ax + By + C = 0)
 * @param B Coefficient B of the infinite line
 * @param C Coefficient C of the infinite line
 * @param segP1 Start point of the segment
 * @param segP2 End point of the segment
 * @returns The intersection Coords if they intersect ON the segment, otherwise undefined.
 */
function intersectLineAndSegment(lineCoefficients: LineCoefficientsBD, segP1: BDCoords, segP2: BDCoords): BDCoords | undefined {
	// 1. Get general form for the infinite line containing the segment
	const segmentCoefficients = vectors.getLineGeneralFormFrom2CoordsBD(segP1, segP2);

	// 2. Calculate intersection of the two infinite lines
	// Uses the provided function calcIntersectionPointOfLines
	const intersectionPoint = calcIntersectionPointOfLinesBD(...lineCoefficients, ...segmentCoefficients);

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
	if (!isPointOnSegment(intersectionPoint, bd.FromCoords(segP1), bd.FromCoords(segP2))) return undefined; // Intersection point is not within the segment bounds.

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
function closestPointOnLineSegment(lineStart: BDCoords, lineEnd: BDCoords, point: BDCoords): { coords: BDCoords, distance: BigDecimal } {
	const dx = bd.subtract(lineEnd[0], lineStart[0]);
	const dy = bd.subtract(lineEnd[1], lineStart[1]);

	// Calculate the squared length of the segment.
	// If the segment has zero length, the start point is the closest point.
	const lineLengthSquared: BigDecimal = bd.add(bd.multiply_fixed(dx, dx), bd.multiply_fixed(dy, dy)); // dx * dx + dy * dy
	if (bd.areEqual(lineLengthSquared, ZERO)) { // If the segment has zero length, return the start point
		const distance = vectors.euclideanDistanceBD(lineStart, point);
		return { coords: lineStart, distance };
	}

	// Calculate the projection parameter t.
	// t = dotProduct((point - lineStart), (lineEnd - lineStart)) / lineLengthSquared
	const xDiff = bd.subtract(point[0], lineStart[0]);
	const yDiff = bd.subtract(point[1], lineStart[1]);
	const addend1 = bd.multiply_fixed(xDiff, dx);
	const addend2 = bd.multiply_fixed(yDiff, dy);
	const dotProduct = bd.add(addend1, addend2);
	let t = bd.divide_fixed(dotProduct, lineLengthSquared);

	// Clamp t to the range [0, 1] to stay within the segment.
	t = bd.clamp(t, ZERO, ONE);

	// Calculate the coordinates of the closest point on the segment.
	const closestX = bd.add(lineStart[0], bd.multiply_fixed(t, dx)); // lineStart[0] + t * dx
	const closestY = bd.add(lineStart[1], bd.multiply_fixed(t, dy)); // lineStart[1] + t * dy
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



// ======================================== Perfect Integer/Rational Geometry ========================================



/**
 * Represents a rational number (fraction) using two BigInts.
 * This allows for perfect precision in calculations involving division.
 */
type TIntersection = {
	/** The parametric value 't' of the intersection, represented as a rational number. */
	ratio: TRatio;
	/**
	 * The type of the bounding box edge that was intersected.
	 * 0 => A horizontal edge (top or bottom), where the Y coordinate is fixed.
	 * 1 => A vertical edge (left or right), where the X coordinate is fixed.
	 */
	type: 0 | 1;
};

/** An object PERFECTLY representing a rational number without floating point imprecision. */
type TRatio = {
	/** Numerator */
	N: bigint;
	/** Denominator */
	D: bigint;
}

/**
 * Normalizes the ratio part of a TIntersection so that the denominator is always positive.
 * This is crucial for consistent sorting, as a negative denominator would otherwise flip the
 * direction of an inequality during comparison.
 * Non-mutating. Returns a new TIntersection object.
 */
function normalizeIntersection(intersection: TIntersection): TIntersection {
	if (intersection.ratio.D < 0n) return {
		ratio: { N: -intersection.ratio.N, D: -intersection.ratio.D },
		type: intersection.type,
	};
	return intersection;
};

/**
 * Finds the intersection points of an integer line with an integer bounding box.
 * 
 * All intermediate calculations are division-free, done with rational numbers
 * (numerators and denominators) to avoid all floating-point inaccuracies,
 * atleast if the final intersection points lie exactly on an integer
 * (if they don't, BigDecimals can't perfectly represent fractions, which is fine).
 *
 * SPECIALIZED. Optimized version that does not use generic rational line
 * intersection methods. It leverages the fact that the box's edges are perfectly vertical
 * and horizontal to reduce the number of arithmetic operations.
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
): IntersectionPoint[] {

	if (log) console.log("Finding line box intersections for coords", startCoords, "with direction", direction, "and box:");
	if (log) console.log(box);

	// 1. Deconstruct inputs into BigInts for precise integer arithmetic

	const [x0, y0] = startCoords;
	const [dx, dy] = direction;
	const { left, right, bottom, top } = box;

	const valid_intersections: TIntersection[] = [];

	// 2. Check for intersections with each of the four box edges

	// Check vertical edges (where x is constant: x = left or x = right)
	if (dx !== 0n) { // A non-zero dx means the line is not vertical and can intersect vertical edges.
		// For a vertical edge at x=left, we solve x0 + t*dx = left.
		// This gives t = (left - x0) / dx. We store this as a rational number (ratio).
		const t_left_ratio = { N: left - x0, D: dx };
		const t_right_ratio = { N: right - x0, D: dx };

		// Now, we must check if the intersection point actually lies ON the segment of the edge.
		// The y-coordinate at the intersection is y = y0 + t*dy.
		// The check is: bottom <= y0 + t*dy <= top.
		// To avoid division, we substitute t = N/D and multiply the entire inequality by D:
		// bottom*D <= y0*D + (N/D)*dy*D <= top*D
		// This simplifies to: bottom*D <= y0*D + N*dy <= top*D
		const y_num_left = y0 * t_left_ratio.D + t_left_ratio.N * dy;
		let y_min_bound = bottom * t_left_ratio.D;
		let y_max_bound = top * t_left_ratio.D;

		// If the denominator D (dx) is negative, multiplying by it flips the inequality signs.
		// We handle this by swapping the min and max bounds.
		if (t_left_ratio.D < 0n) {
			[y_min_bound, y_max_bound] = [y_max_bound, y_min_bound];
		}
		if (y_num_left >= y_min_bound && y_num_left <= y_max_bound) {
			valid_intersections.push({ ratio: t_left_ratio, type: 1 });
		}

		// Repeat the same check for the right edge. The denominator and thus the bounds are the same.
		const y_num_right = y0 * t_right_ratio.D + t_right_ratio.N * dy;
		if (y_num_right >= y_min_bound && y_num_right <= y_max_bound) {
			valid_intersections.push({ ratio: t_right_ratio, type: 1 });
		}
	}

	// Check horizontal edges (where y is constant: y = bottom or y = top)
	if (dy !== 0n) { // A non-zero dy means the line is not horizontal and can intersect horizontal edges.
		// Similarly, for a horizontal edge at y=bottom, we solve y0 + t*dy = bottom.
		// This gives t = (bottom - y0) / dy.
		const t_bottom_ratio = { N: bottom - y0, D: dy };
		const t_top_ratio = { N: top - y0, D: dy };

		// The check is now on the x-coordinate: left <= x0 + t*dx <= right.
		// Cross-multiplying by D (dy) gives: left*D <= x0*D + N*dx <= right*D
		const x_num_bottom = x0 * t_bottom_ratio.D + t_bottom_ratio.N * dx;
		let x_min_bound = left * t_bottom_ratio.D;
		let x_max_bound = right * t_bottom_ratio.D;

		// Again, swap bounds if the denominator D (dy) is negative.
		if (t_bottom_ratio.D < 0n) {
			[x_min_bound, x_max_bound] = [x_max_bound, x_min_bound];
		}
		if (x_num_bottom >= x_min_bound && x_num_bottom <= x_max_bound) {
			valid_intersections.push({ ratio: t_bottom_ratio, type: 0 });
		}

		// Repeat for the top edge.
		const x_num_top = x0 * t_top_ratio.D + t_top_ratio.N * dx;
		if (x_num_top >= x_min_bound && x_num_top <= x_max_bound) {
			valid_intersections.push({ ratio: t_top_ratio, type: 0 });
		}
	}

	// 3. De-duplicate and Sort the valid t-ratios

	// If the line passes through a corner, it will generate two intersection objects with
	// identical rational 't' values. This filter removes such duplicates.
	// The comparison `v.N * t.D === t.N * v.D` is a division-free way of checking if v.N/v.D === t.N/t.D.
	const unique_intersections = valid_intersections.filter((v, i, a) => 
		a.findIndex(t => v.ratio.N * t.ratio.D === t.ratio.N * v.ratio.D) === i
	);

	// Sort the intersections by their 't' value to order them correctly along the line.
	// We compare t1 and t2 (a.ratio and b.ratio) without division.
	// a < b  is equivalent to  a.N/a.D < b.N/b.D.
	// Cross-multiplying gives a.N*b.D < b.N*a.D (assuming positive denominators).
	// `normalizeIntersection` is called first to ensure denominators are positive.
	unique_intersections.sort((a, b) => {
		const norm_a = normalizeIntersection(a);
		const norm_b = normalizeIntersection(b);
		const diff = norm_a.ratio.N * norm_b.ratio.D - norm_b.ratio.N * norm_a.ratio.D;
		return bimath.compare(diff, 0n);
	});

	// 4. Map sorted rational intersections to the final BigDecimal output format

	const bd_x0 = bd.FromBigInt(x0);
	const bd_y0 = bd.FromBigInt(y0);

	const bd_dx = bd.FromBigInt(dx);
	const bd_dy = bd.FromBigInt(dy);

	return unique_intersections.map(intersection => {
		const { ratio, type } = intersection;
		let x: BigDecimal;
		let y: BigDecimal;
        
		const bd_N = bd.FromBigInt(ratio.N);
		const bd_D = bd.FromBigInt(ratio.D);

		if (type === 1) { // Vertical intersection
			// For a vertical intersection, we know the x-coordinate is EXACTLY on the boundary.
			// We "snap" it to the integer value of the boundary to prevent any potential precision loss
			// that might come from calculating `x0 + t*dx`.
			x = ratio.N === left - x0 ? bd.FromBigInt(left) : bd.FromBigInt(right);
			// The y-coordinate is then calculated using the precise rational value of t.
			// y = y0 + (N/D) * dy -> y = (y0*D + N*dy) / D
			const y_numerator = bd.add(bd.multiply_fixed(bd_y0, bd_D), bd.multiply_fixed(bd_N, bd_dy));
			y = bd.divide_fixed(y_numerator, bd_D);
		} else { // type === 0 => Horizontal intersection
			// Similarly, snap the y-coordinate to the known boundary.
			y = ratio.N === bottom - y0 ? bd.FromBigInt(bottom) : bd.FromBigInt(top);
			// And calculate the x-coordinate.
			const x_numerator = bd.add(bd.multiply_fixed(bd_x0, bd_D), bd.multiply_fixed(bd_N, bd_dx));
			x = bd.divide_fixed(x_numerator, bd_D);
		}

		if (log) console.log("Coordinates of intersection:", coordutil.stringifyBDCoords([x, y]));

		// The dot product of the direction vector and the vector to the intersection point
		// determines if the intersection is "in front of" the starting point.
		// The sign of the dot product is the same as the sign of 't'.
		// The sign of t = N/D is the same as the sign of N*D, which avoids division.
		const positiveDotProduct = ratio.N * ratio.D >= 0n;

		return {
			coords: [x, y],
			positiveDotProduct,
		};
	});
}



// ======================================================================================================


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
	findLineBoxIntersectionsInteger,
};

export type {
	IntersectionPoint,
};