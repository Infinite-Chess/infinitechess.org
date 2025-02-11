
/**
 * This script contains utility methods for working with splines.
 */

import type { Coords } from "../chess/util/coordutil.js";

import { createModel } from "../game/rendering/buffermodel.js";
// @ts-ignore
import space from "../game/misc/space.js";
// @ts-ignore
import movement from "../game/rendering/movement.js";


// Functions ---------------------------------------------------------------------------------------------------


function computeNaturalCubicSpline(points: number[]): { a: number, b: number, c: number, d: number }[] {
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

	// Compute d and b
	for (let i = 0; i < n - 1; i++) {
		d[i] = (c[i + 1] - c[i]) / 3;
		b[i] = (points[i + 1]! - points[i]!) - (2 * c[i]! + c[i + 1]!) / 3;
	}

	return a.map((aVal, i) => ({ a: aVal, b: b[i], c: c[i], d: d[i] }));
}

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

function evaluateCubicSpline(t: number, spline: { a: number, b: number, c: number, d: number }[]): number {
	const i = Math.max(0, Math.min(spline.length - 1, Math.floor(t)));
	const { a, b, c, d } = spline[i]!;
	const dt = t - i;
	return a + b * dt + c * dt * dt + d * dt * dt * dt;
}

function generateSplineWaypoints(waypoints: Coords[], numStepsPerSegment: number): Coords[] {
	if (waypoints.length < 2) return waypoints;

	const xPoints = waypoints.map(wp => wp[0]);
	const yPoints = waypoints.map(wp => wp[1]);
	const xSpline = computeNaturalCubicSpline(xPoints);
	const ySpline = computeNaturalCubicSpline(yPoints);

	const dense: Coords[] = [];
	const totalSegments = waypoints.length - 1;

	for (let i = 0; i < totalSegments; i++) {
		const isLast = i === totalSegments - 1;
		for (let k = 0; k <= numStepsPerSegment; k++) {
			const t = i + (k / numStepsPerSegment);
			if (!isLast && k === numStepsPerSegment) continue;

			let x = evaluateCubicSpline(t, xSpline) ?? xPoints[xPoints.length - 1];
			let y = evaluateCubicSpline(t, ySpline) ?? yPoints[yPoints.length - 1];

			// Ensure the last waypoint exactly matches the input
			if (isLast && k === numStepsPerSegment) [x, y] = waypoints[waypoints.length - 1]!;

			dense.push([x, y]);
		}
	}

	return dense;
}

/**
 * Renders a debug visualization of the entire spline as a continuous ribbon.
 * @param waypoints - The original spline waypoints. Each point is the coordinate on the grid, NOT grid space.
 * @param [lineWidth=5] - The debug line width in world units.
 * @param [color=[1, 0, 0, 1]] - RGBA color for the debug line.
 */
function debugRenderSpline(
	waypoints: Coords[],
	lineWidth: number,
	color: [number, number, number, number]
): void {
	if (waypoints.length < 2) throw Error("Spline requires at least 2 waypoints to render.");

	lineWidth *= movement.getBoardScale(); // Scale proportionally to the board scale

	const vertexData: number[] = [];
	const halfWidth = lineWidth / 2;

	const leftPoints: [number, number][] = [];
	const rightPoints: [number, number][] = [];

	// Compute left/right offsets per vertex using averaged tangents.
	for (let i = 0; i < waypoints.length; i++) {
		// Convert current point to world space.
		const wp = space.convertCoordToWorldSpace(waypoints[i]);
		let tangent: [number, number];

		if (i === 0) {
			const next = space.convertCoordToWorldSpace(waypoints[i + 1]);
			tangent = [next[0] - wp[0], next[1] - wp[1]];
		} else if (i === waypoints.length - 1) {
			const prev = space.convertCoordToWorldSpace(waypoints[i - 1]);
			tangent = [wp[0] - prev[0], wp[1] - prev[1]];
		} else {
			const prev = space.convertCoordToWorldSpace(waypoints[i - 1]);
			const next = space.convertCoordToWorldSpace(waypoints[i + 1]);
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
		leftPoints.push([wp[0] + normal[0] * halfWidth, wp[1] + normal[1] * halfWidth]);
		rightPoints.push([wp[0] - normal[0] * halfWidth, wp[1] - normal[1] * halfWidth]);
	}

	// Build triangles for each segment.
	for (let i = 0; i < waypoints.length - 1; i++) {
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
	computeNaturalCubicSpline,
	evaluateCubicSpline,
	generateSplineWaypoints,
	debugRenderSpline
};