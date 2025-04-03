
/**
 * This script contains utility methods for working with splines.
 * 
 * Methods written by DeepSeek R1 and ChatGPT Reason.
 */

import type { Coords } from "../chess/util/coordutil.js";
import type { Color } from "./math.js";

import { createModel } from "../game/rendering/buffermodel.js";
import space from "../game/misc/space.js";

/**
 * Computes a natural cubic spline for a given set of points.
 * @param points - Array of y-values representing the points to interpolate.
 * @returns Array of spline coefficients (a, b, c, d) for each segment.
 */
function generateCubicSplineCoefficients(points: number[]): { a: number, b: number, c: number, d: number }[] {
	const n = points.length;
	if (n < 2) return [];
    
	const a = points.slice(0, -1);
	const b = new Array(n - 1).fill(0);
	const c = new Array(n).fill(0);
	const d = new Array(n - 1).fill(0);

	if (n === 2) {
		b[0] = points[1]! - points[0]!;
		return [{ a: a[0]!, b: b[0]!, c: c[0]!, d: d[0]! }];
	}

	// Setup tridiagonal system
	const rhs: number[] = [];
	for (let i = 0; i < n - 2; i++) {
		rhs.push(3 * (points[i]! + points[i + 2]! - 2 * points[i + 1]!));
	}

	const subDiag = new Array(n - 3).fill(1);
	const mainDiag = new Array(n - 2).fill(4);
	const superDiag = new Array(n - 3).fill(1);
	const cSolution = thomasAlgorithm(subDiag, mainDiag, superDiag, rhs);

	for (let i = 1; i <= n - 2; i++) c[i] = cSolution[i - 1];

	// Compute d and b coefficients
	for (let i = 0; i < n - 1; i++) {
		d[i] = (c[i + 1] - c[i]) / 3;
		b[i] = (points[i + 1]! - points[i]!) - (2 * c[i]! + c[i + 1]!) / 3;
	}

	return a.map((aVal, i) => ({ a: aVal, b: b[i], c: c[i], d: d[i] }));
}

/**
 * Solves a tridiagonal system using the Thomas algorithm.
 * @param a - Sub-diagonal coefficients.
 * @param b - Main diagonal coefficients.
 * @param c - Super-diagonal coefficients.
 * @param d - Right-hand side values.
 * @returns Solution array.
 */
function thomasAlgorithm(a: number[], b: number[], c: number[], d: number[]): number[] {
	const n = d.length;
	if (n === 0) return [];
    
	const cp = [...c], dp = [...d];
	cp[0]! /= b[0]!;
	dp[0]! /= b[0]!;

	for (let i = 1; i < n; i++) {
		const m = 1 / (b[i]! - a[i - 1]! * cp[i - 1]!);
		cp[i] = (c[i] || 0) * m;
		dp[i] = (d[i]! - a[i - 1]! * dp[i - 1]!) * m;
	}

	for (let i = n - 2; i >= 0; i--) {
		dp[i]! -= cp[i]! * dp[i + 1]!;
	}

	return dp;
}

/**
 * Evaluates the cubic spline at a given parameter t.
 * @param t - Parameter value.
 * @param coefficients - Array of spline coefficients.
 * @returns Interpolated value.
 */
function evaluateSplineAt(t: number, coefficients: { a: number, b: number, c: number, d: number }[]): number {
	const i = Math.max(0, Math.min(coefficients.length - 1, Math.floor(t)));
	const { a, b, c, d } = coefficients[i]!;
	const dt = t - i;
	return a + b * dt + c * dt * dt + d * dt * dt * dt;
}

/**
 * Computes an interpolated trajectory along a cubic spline, generating a smooth path through given control points.
 * @param controlPoints - Array of 2D coordinate points defining the spline.
 * @param resolution - Number of interpolated points between each pair of control points.
 * @returns An array of interpolated points along the spline.
 */
function generateSplinePath(controlPoints: Coords[], resolution: number): Coords[] { // Better name for waypoints? Whats the math term for the points of a spline
	if (controlPoints.length < 3) return controlPoints; // A straight line already has infinite precision

	const xPoints = controlPoints.map(point => point[0]);
	const yPoints = controlPoints.map(point => point[1]);
	const xSpline = generateCubicSplineCoefficients(xPoints);
	const ySpline = generateCubicSplineCoefficients(yPoints);

	const path: Coords[] = [];
	const totalSegments = controlPoints.length - 1;

	for (let i = 0; i < totalSegments; i++) {
		const isLast = i === totalSegments - 1;
		for (let k = 0; k <= resolution; k++) {
			const t = i + (k / resolution);
			if (!isLast && k === resolution) continue;

			let x = evaluateSplineAt(t, xSpline);
			let y = evaluateSplineAt(t, ySpline);

			/**
			 * Ensure the last waypoint exactly matches the input.
			 * Otherwise, a bug is created when the animation manager
			 * expects there to be a piece at the last waypoint, but the last
			 * waypoint isn't an integer because of floating point imprecision.
			 */
			if (isLast && k === resolution) [x, y] = controlPoints[controlPoints.length - 1]!;

			path.push([x, y]);
		}
	}

	return path;
}

/**
 * Renders a debug visualization of the entire spline as a continuous ribbon.
 * @param controlPoints - The original spline waypoints. Each point is the square-coordinate, NOT in grid space.
 * @param width - The ribbon's width in square units.
 * @param color - RGBA color for the ribbon.
 */
function renderSplineDebug(
	controlPoints: Coords[],
	width: number,
	color: Color
): void {
	if (controlPoints.length < 2) throw Error("Spline requires at least 2 waypoints to render.");

	const vertexData: number[] = [];
	const halfWidth = width / 2;

	let leftPoints: Coords[] = [];
	let rightPoints: Coords[] = [];

	// Compute left/right offsets per vertex using averaged tangents.
	for (let i = 0; i < controlPoints.length; i++) {
		const point = controlPoints[i]!;
		let tangent: Coords;

		if (i === 0) {
			const next = controlPoints[i + 1]!;
			tangent = [next[0] - point[0], next[1] - point[1]];
		} else if (i === controlPoints.length - 1) {
			const prev = controlPoints[i - 1]!;
			tangent = [point[0] - prev[0], point[1] - prev[1]];
		} else {
			const prev = controlPoints[i - 1]!;
			const next = controlPoints[i + 1]!;
			tangent = [next[0] - prev[0], next[1] - prev[1]];
		}

		// Normalize tangent.
		const tLen = Math.hypot(tangent[0], tangent[1]);
		if (tLen !== 0) {
			tangent = [tangent[0] / tLen, tangent[1] / tLen];
		} else {
			tangent = [0, 0];
		}
		// Compute the perpendicular normal.
		const normal: [number, number] = [-tangent[1], tangent[0]];

		// Offset positions.
		leftPoints.push([point[0] + normal[0] * halfWidth, point[1] + normal[1] * halfWidth]);
		rightPoints.push([point[0] - normal[0] * halfWidth, point[1] - normal[1] * halfWidth]);
	}

	// Convert coordinates to world space.
	leftPoints = leftPoints.map(point => space.convertCoordToWorldSpace(point));
	rightPoints = rightPoints.map(point => space.convertCoordToWorldSpace(point));

	// Build triangles for each segment.
	for (let i = 0; i < controlPoints.length - 1; i++) {
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