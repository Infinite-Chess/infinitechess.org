
// src/client/scripts/esm/util/splines.ts

/**
 * This script contains utility methods for working with splines.
 */

import type { BDCoords, Coords, DoubleCoords } from "../chess/util/coordutil.js";
import type { Color } from "./math/math.js";
import type { BigDecimal } from "./bigdecimal/bigdecimal.js";

import { createModel } from "../game/rendering/buffermodel.js";
import space from "../game/misc/space.js";
import bd from "./bigdecimal/bigdecimal.js";
import boardpos from "../game/rendering/boardpos.js";


// Constants ------------------------------------------------------

const ZERO = bd.FromBigInt(0n);
const ONE = bd.FromBigInt(1n);
const TWO = bd.FromBigInt(2n);
const THREE = bd.FromBigInt(3n);
const FOUR = bd.FromBigInt(4n);


// Functions ---------------------------------------------------------------


/**
 * Computes a natural cubic spline for a given set of points.
 * @param points - Array of y-values representing the points to interpolate.
 * @returns Array of spline coefficients (a, b, c, d) for each segment.
 */
function generateCubicSplineCoefficients(points: bigint[]): { a: BigDecimal, b: BigDecimal, c: BigDecimal, d: BigDecimal }[] {
	const n = points.length;
	if (n < 2) return [];
    
	const a: BigDecimal[] = points.slice(0, -1).map(p => bd.FromBigInt(p));
	const b: BigDecimal[] = new Array(n - 1).fill(ZERO);
	const c: BigDecimal[] = new Array(n).fill(ZERO);
	const d: BigDecimal[] = new Array(n - 1).fill(ZERO);

	if (n === 2) {
		b[0] = bd.FromBigInt(points[1]! - points[0]!);
		return [{ a: a[0]!, b: b[0]!, c: c[0]!, d: d[0]! }];
	}

	// Setup tridiagonal system
	const rhs: BigDecimal[] = [];
	for (let i = 0; i < n - 2; i++) {
		rhs.push(bd.FromBigInt(3n * (points[i]! + points[i + 2]! - 2n * points[i + 1]!)));
	}

	const subDiag: BigDecimal[] = new Array(n - 3).fill(ONE);
	const mainDiag: BigDecimal[] = new Array(n - 2).fill(FOUR);
	const superDiag: BigDecimal[] = new Array(n - 3).fill(ONE);
	const cSolution = thomasAlgorithm(subDiag, mainDiag, superDiag, rhs);

	for (let i = 1; i <= n - 2; i++) c[i] = cSolution[i - 1]!;

	// Compute d and b coefficients
	for (let i = 0; i < n - 1; i++) {
		d[i] = bd.divide_fixed((bd.subtract(c[i + 1]!, c[i]!)), THREE); // d[i] = (c[i + 1] - c[i]) / 3;
		// (points[i + 1]! - points[i]!) - (2 * c[i]! + c[i + 1]!) / 3
		const b_subtrahend = bd.FromBigInt(points[i + 1]! - points[i]!); // points[i + 1]! - points[i]!
		const dividend = bd.add(bd.multiply_fixed(c[i]!, TWO), c[i + 1]!); // 2 * c[i]! + c[i + 1]!
		const quotient = bd.divide_fixed(dividend, THREE); // (2 * c[i]! + c[i + 1]!) / 3
		b[i] = bd.subtract(b_subtrahend, quotient); // // (points[i + 1]! - points[i]!) - (2 * c[i]! + c[i + 1]!) / 3
	}

	return a.map((aVal, i) => ({ a: aVal, b: b[i]!, c: c[i]!, d: d[i]! }));
}

/**
 * Solves a tridiagonal system using the Thomas algorithm.
 * @param a - Sub-diagonal coefficients.
 * @param b - Main diagonal coefficients.
 * @param c - Super-diagonal coefficients.
 * @param d - Right-hand side values.
 * @returns Solution array.
 */
function thomasAlgorithm(a: BigDecimal[], b: BigDecimal[], c: BigDecimal[], d: BigDecimal[]): BigDecimal[] {
	const n = d.length;
	if (n === 0) return [];

	// Handle the 1x1 system case, which occurs when there are 3 control points.
	// In this case, 'a' and 'c' are empty, and 'b' and 'd' have one element.
	// The system is simply b[0]*x[0] = d[0], so x[0] = d[0]/b[0].
	// Without this, a crash happens if you move the rose 2 hops in one move.
	if (n === 1) return [bd.divide_fixed(d[0]!, b[0]!)];
    
	const cp: BigDecimal[] = [...c];
	const dp: BigDecimal[] = [...d];

	cp[0] = bd.divide_fixed(cp[0]!, b[0]!);
	dp[0] = bd.divide_fixed(dp[0]!, b[0]!);

	for (let i = 1; i < n; i++) {
		const m_denominator = bd.subtract(b[i]!, bd.multiply_fixed(a[i - 1]!, cp[i - 1]!)); // (b[i]! - a[i - 1]! * cp[i - 1]!)
		const m = bd.divide_fixed(ONE, m_denominator); // 1 / (b[i]! - a[i - 1]! * cp[i - 1]!)
		
		const c_i = c[i] || ZERO; // Handle case where c might be shorter
		cp[i] = bd.multiply_fixed(c_i, m); // (c[i] || 0) * m
		
		const dp_subtrahend = bd.multiply_fixed(a[i - 1]!, dp[i - 1]!);
		const dp_term = bd.subtract(d[i]!, dp_subtrahend);
		dp[i] = bd.multiply_fixed(dp_term, m);
	}

	for (let i = n - 2; i >= 0; i--) {
		const subtractor = bd.multiply_fixed(cp[i]!, dp[i + 1]!);
		dp[i] = bd.subtract(dp[i]!, subtractor);
	}

	return dp;
}

/**
 * Evaluates the cubic spline at a given parameter t.
 * @param t - Parameter value.
 * @param coefficients - Array of spline coefficients.
 * @returns Interpolated value.
 */
function evaluateSplineAt(t: number, coefficients: { a: BigDecimal, b: BigDecimal, c: BigDecimal, d: BigDecimal }[]): BigDecimal {
	const i = Math.max(0, Math.min(coefficients.length - 1, Math.floor(t)));
	const { a, b, c, d } = coefficients[i]!;
	
	// Convert dt to a BigDecimal for high-precision calculations
	const dt = bd.FromNumber(t - i);
	const dt2 = bd.multiply_fixed(dt, dt);
	const dt3 = bd.multiply_fixed(dt2, dt);

	// Evaluate polynomial: a + b*dt + c*dt^2 + d*dt^3
	const termB = bd.multiply_fixed(b, dt);
	const termC = bd.multiply_fixed(c, dt2);
	const termD = bd.multiply_fixed(d, dt3);

	return bd.add(a, bd.add(termB, bd.add(termC, termD)));
}

/**
 * Computes an interpolated trajectory along a cubic spline, generating a smooth path through given control points.
 * @param controlPoints - Array of 2D coordinate points defining the spline. The points of a spline are often called "knots" or "control points".
 * @param resolution - Number of interpolated points between each pair of control points.
 * @returns An array of interpolated points along the spline.
 */
function generateSplinePath(controlPoints: Coords[], resolution: number): BDCoords[] {
	// A straight line already has infinite precision
	if (controlPoints.length < 3) return controlPoints.map(([x, y]) => [bd.FromBigInt(x), bd.FromBigInt(y)]);

	// Extract the bigint x and y components into separate arrays.
	const xPoints = controlPoints.map(point => point[0]);
	const yPoints = controlPoints.map(point => point[1]);

	// Generate the spline coefficients for each axis.
	const xSpline = generateCubicSplineCoefficients(xPoints);
	const ySpline = generateCubicSplineCoefficients(yPoints);

	const path: BDCoords[] = [];
	const totalSegments = controlPoints.length - 1;

	// Loop through each segment of the spline.
	for (let i = 0; i < totalSegments; i++) {
		const isLastSegment = i === totalSegments - 1;
		
		// Interpolate points within the current segment.
		for (let k = 0; k <= resolution; k++) {
			// To avoid duplicating points, skip the end of a segment if it's not the final one.
			if (!isLastSegment && k === resolution) continue;
			
			// 't' is the parameter for spline evaluation, ranging from 0 to n-1.
			const t = i + (k / resolution);

			let x: BigDecimal;
			let y: BigDecimal;

			/**
			 * For the very last point, use the exact control point value to guarantee
			 * it matches the input, avoiding any potential floating-point drift from 't'.
			 * 
			 * A bug is created when the animation manager
			 * expects there to be a piece at the last waypoint, but the last
			 * waypoint isn't an integer because of floating point imprecision.
			 * 
			 * This hasn't been tested again since converting to BigDecimals.
			 */
			if (isLastSegment && k === resolution) {
				const finalPoint = controlPoints[controlPoints.length - 1]!;
				x = bd.FromBigInt(finalPoint[0]);
				y = bd.FromBigInt(finalPoint[1]);
			} else {
				// Evaluate the spline at parameter 't' to get the interpolated coordinates.
				x = evaluateSplineAt(t, xSpline);
				y = evaluateSplineAt(t, ySpline);
			}

			path.push([x, y]);
		}
	}

	return path;
}

/**
 * Renders a debug visualization of the spline.
 * All geometric calculations are done in world space for rendering efficiency.
 * @param controlPoints - The spline waypoints as high-precision square coordinates.
 * @param width - The ribbon's desired width, specified in square units.
 * @param color - RGBA color for the ribbon.
 */
function renderSplineDebug(
	controlPoints: BDCoords[],
	width: number,
	color: Color
): void {
	if (controlPoints.length < 2) throw Error("Spline requires at least 2 waypoints to render.");

	// Convert all high-precision square coordinates to world-space
	// floating-point coordinates immediately so we can perform double arithmetic.
	const worldControlPoints: DoubleCoords[] = controlPoints.map(p => space.convertCoordToWorldSpace(p));

	// Convert the desired width from square units to world units by applying the board scale.
	const scale = boardpos.getBoardScaleAsNumber();
	const halfWorldWidth = (width * scale) / 2;

	const vertexData: number[] = [];
	const leftPoints: DoubleCoords[] = [];
	const rightPoints: DoubleCoords[] = [];

	// Compute left/right offsets per vertex using standard float math in world space.
	for (let i = 0; i < worldControlPoints.length; i++) {
		const point = worldControlPoints[i]!;
		let tangent: DoubleCoords;

		if (i === 0) {
			const next = worldControlPoints[i + 1]!;
			tangent = [next[0] - point[0], next[1] - point[1]];
		} else if (i === worldControlPoints.length - 1) {
			const prev = worldControlPoints[i - 1]!;
			tangent = [point[0] - prev[0], point[1] - prev[1]];
		} else {
			const prev = worldControlPoints[i - 1]!;
			const next = worldControlPoints[i + 1]!;
			tangent = [next[0] - prev[0], next[1] - prev[1]];
		}

		// Normalize the tangent vector.
		const tLen = Math.hypot(tangent[0], tangent[1]);
		if (tLen !== 0) {
			tangent = [tangent[0] / tLen, tangent[1] / tLen];
		} else {
			tangent = [0, 0];
		}
		
		// Compute the perpendicular normal vector.
		const normal: DoubleCoords = [-tangent[1], tangent[0]];

		// Offset positions in world space to find the ribbon edges.
		leftPoints.push([point[0] + normal[0] * halfWorldWidth, point[1] + normal[1] * halfWorldWidth]);
		rightPoints.push([point[0] - normal[0] * halfWorldWidth, point[1] - normal[1] * halfWorldWidth]);
	}

	// Build triangles for each segment.
	for (let i = 0; i < worldControlPoints.length - 1; i++) {
		const left0 = leftPoints[i]!;
		const right0 = rightPoints[i]!;
		const left1 = leftPoints[i + 1]!;
		const right1 = rightPoints[i + 1]!;

		// Triangle 1: left0, right0, left1
		vertexData.push(...left0, ...color);
		vertexData.push(...right0, ...color);
		vertexData.push(...left1, ...color);

		// Triangle 2: left1, right0, right1
		vertexData.push(...left1, ...color);
		vertexData.push(...right0, ...color);
		vertexData.push(...right1, ...color);
	}

	// Create and render the debug model.
	createModel(vertexData, 2, "TRIANGLES", true).render();
}


// Exports -----------------------------------------------------------------------------------------------------


export default {
	generateCubicSplineCoefficients,
	evaluateSplineAt,
	generateSplinePath,
	renderSplineDebug
};