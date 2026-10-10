// src/client/scripts/esm/views/analysis/compression/positioncompressor.ts

/**
 * Compresses a position too spread out for the engine's i64 coordinates, so the engine perceives
 * exactly what it would in the original.
 *
 * Under every line form the engine reads, two points within {@link enginehorizons.EXACT_SPAN}
 * keep their exact difference, and points further apart keep their order and stay beyond it. Every
 * coordinate keeps its residue, so lines still cross on the same squares. The few crossings where
 * a slider lands near a third line far from every piece are kept too ({@link crossings}).
 * Far gaps shrink to astronomically large but representable, jittered sizes, so the compressed
 * position is as free of accidental alignments as the original. The origin, which the engine
 * anchors its far escapes and TT moves to, stays put. Every result is verified.
 */

import type { Slider } from './crossings.js';
import type { Coords } from '../../../../../../shared/util/coordutil.js';
import type { LineForm } from './lineforms.js';
import type { Clustering, CompressionPoint } from './clustering.js';

import bimath from '../../../../../../shared/util/math/bimath.js';

import skeleton from './skeleton.js';
import lineforms from './lineforms.js';
import placement from './placement.js';
import crossings from './crossings.js';
import clustering from './clustering.js';
import enginehorizons from './enginehorizons.js';

// Types -----------------------------------------------------------------------

/** A position to compress, as the points whose relations must survive. */
interface CompressionInput {
	points: CompressionPoint[];
	/**
	 * How many leading points the engine reads lines through: the board it searches, the en passant
	 * squares and every lone line. The rest are squares it only replays the move history over.
	 */
	perceived: number;
	/** Every line form the position's pieces relate along. */
	forms: LineForm[];
	sliders: Slider[];
	/** Whether a piece reads exact distances at every range (a Huygen), which no compression keeps. */
	readsExactDistances: boolean;
}

// Constants -------------------------------------------------------------------

/**
 * Compressed coordinates stay within this, so the engine's unchecked sums of
 * coordinates (diagonal keys, the kings' midpoint, a mean of 200 pieces) fit i64.
 */
const RANGE = 2n ** 54n;

/**
 * The unit far gaps shrink to, and the jitter seed, of each attempt in turn. Smaller units fit
 * more clusters in {@link RANGE}; fresh jitter breaks an accidental alignment the last one made.
 */
const ATTEMPTS: { unit: bigint; seed: number }[] = [
	{ unit: 2n ** 44n, seed: 1 },
	{ unit: 2n ** 44n, seed: 2 },
	{ unit: 2n ** 40n, seed: 3 },
	{ unit: 2n ** 36n, seed: 4 },
	{ unit: 2n ** 33n, seed: 5 },
];

// Functions -------------------------------------------------------------------

/**
 * Each point's compressed coordinates, or undefined when the position can't be brought within the
 * engine's reach faithfully.
 */
function compress(input: CompressionInput): Coords[] | undefined {
	if (input.readsExactDistances) return undefined;
	const modulus = lineforms.residueModulus(input.forms);
	const origin = input.points.length;
	const { points, structure, meetings } = withCrossingPoints(input, [...input.points, { coords: [0n, 0n] }, ...boundaryCrossings(input)]); // prettier-ignore
	const home = structure.clusterOf[origin]!;
	for (const { unit, seed } of ATTEMPTS) {
		const layout = skeleton.lay(points, input.forms, structure, home, unit, 2n * RANGE, seededRandom(seed)); // prettier-ignore
		if (!layout) continue;
		const coords = placement.place(points, input.forms, structure, layout, home, unit, modulus);
		if (coords && verify(input, points, structure, meetings, coords, modulus)) {
			return coords.slice(0, input.points.length);
		}
	}
	return undefined;
}

/**
 * Where every square's lines cross every boundary (a border edge). A crossing of two lines lands
 * on a boundary's inner side exactly when those lines cross the boundary in a given order, so
 * keeping the order of these points along it keeps every crossing's side. A crossing between two
 * squares is bracketed by both.
 */
function boundaryCrossings(input: CompressionInput): CompressionPoint[] {
	const squares = input.points.slice(0, input.perceived).filter((point) => !point.line);
	const seen = new Set(squares.map((square) => `${square.coords[0]},${square.coords[1]}`));
	const added: CompressionPoint[] = [];
	for (const edge of input.points) {
		if (!edge.line?.boundary) continue;
		const fixedAxis = clustering.usesAxis(input.forms, edge, 0) ? 0 : 1;
		const fixed = edge.coords[fixedAxis];
		for (const square of squares) {
			for (const form of input.forms) {
				const [fixedCoefficient, freeCoefficient] = fixedAxis === 0 ? [form.a, form.b] : [form.b, form.a]; // prettier-ignore
				if (freeCoefficient === 0n) continue; // Parallel to the edge.
				const numerator = lineforms.value(form, square.coords) - fixedCoefficient * fixed;
				for (const free of bracket(numerator, freeCoefficient)) {
					const coords: Coords = fixedAxis === 0 ? [fixed, free] : [free, fixed];
					const key = `${coords[0]},${coords[1]}`;
					if (seen.has(key)) continue;
					seen.add(key);
					added.push({ coords });
				}
			}
		}
	}
	return added;
}

/** The integers at and around `numerator / denominator`: just it when exact, else the two either side. */
function bracket(numerator: bigint, denominator: bigint): bigint[] {
	const quotient = numerator / denominator;
	if (quotient * denominator === numerator) return [quotient];
	const below = numerator < 0n !== denominator < 0n ? quotient - 1n : quotient;
	return [below, below + 1n];
}

/**
 * Adds, as a point of its own, every square where a slider meets two other lines far from every
 * existing point, so compression keeps it. One within a quarter of the exact span of a point
 * already shares that point's classes in every form, which keeps it without help.
 */
function withCrossingPoints(
	input: CompressionInput,
	basePoints: CompressionPoint[],
): { points: CompressionPoint[]; structure: Clustering; meetings: Map<string, bigint> } {
	const base = clustering.build(basePoints, input.forms);
	const meetings = crossings.find(input.forms, input.sliders, base, base.values, input.perceived);
	const added = new Map<string, Coords>();
	for (const square of crossings.squares(input.forms, base.values, meetings)) {
		if (!isNearAnyPoint(input.forms, base, square))
			added.set(`${square[0]},${square[1]}`, square);
	}
	if (added.size === 0) return { points: basePoints, structure: base, meetings };

	const points = [...basePoints, ...[...added.values()].map((coords) => ({ coords }))];
	const structure = clustering.build(points, input.forms);
	return { points, structure, meetings: crossings.find(input.forms, input.sliders, structure, structure.values, input.perceived) }; // prettier-ignore
}

/** Whether a square of `structure` lies within a quarter of the exact span of `square`, on both axes. */
function isNearAnyPoint(
	forms: readonly LineForm[],
	structure: Clustering,
	square: Coords,
): boolean {
	const reach = enginehorizons.EXACT_SPAN / 4n;
	const xForm = forms.findIndex((form) => form.b === 0n);
	const xs = structure.orders[xForm]!;
	const values = structure.values[xForm]!;
	let low = 0;
	for (let high = xs.length; low < high; ) {
		const mid = (low + high) >>> 1;
		if (values[xs[mid]!]! < square[0] - reach) low = mid + 1;
		else high = mid;
	}
	const yForm = forms.findIndex((form) => form.a === 0n);
	for (let k = low; k < xs.length && values[xs[k]!]! <= square[0] + reach; k++) {
		const y = structure.values[yForm]![xs[k]!];
		if (y !== undefined && bimath.abs(y - square[1]) <= reach) return true;
	}
	return false;
}

/** A deterministic [0, 1) generator, so the same position always compresses the same way. */
function seededRandom(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = Math.imul(state ^ (state >>> 15), 1 | state);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
	};
}

// Verification ----------------------------------------------------------------

/**
 * Whether `coords` keeps everything compression promises: within {@link RANGE}, every residue,
 * every exact difference and far order under every form, and every slider's meetings.
 */
function verify(
	input: CompressionInput,
	points: readonly CompressionPoint[],
	structure: Clustering,
	meetings: Map<string, bigint>,
	coords: Coords[],
	modulus: bigint,
): boolean {
	for (let i = 0; i < points.length; i++) {
		for (const axis of [0, 1] as const) {
			if (!clustering.usesAxis(input.forms, points[i]!, axis)) continue;
			if (bimath.abs(coords[i]![axis]) > RANGE) return false;
			if ((coords[i]![axis] - points[i]!.coords[axis]) % modulus !== 0n) return false;
		}
	}
	const values = structure.values.map(
		(formValues, f) =>
		formValues.map((value, i) => (value === undefined ? undefined : lineforms.value(input.forms[f]!, coords[i]!))), // prettier-ignore
	);
	if (!keepsEveryGap(structure, values)) return false;

	const compressedMeetings = crossings.find(
		input.forms,
		input.sliders,
		structure,
		values,
		input.perceived,
	);
	if (compressedMeetings.size !== meetings.size) return false;
	for (const [key, offset] of meetings) if (compressedMeetings.get(key) !== offset) return false;
	return true;
}

/**
 * Whether every gap between neighbours under every form is kept: exactly within the exact span,
 * beyond it otherwise. Every pair's relation is a sum of such gaps, so this keeps them all.
 */
function keepsEveryGap(structure: Clustering, compressed: (bigint | undefined)[][]): boolean {
	return structure.orders.every((order, f) => {
		const [original, values] = [structure.values[f]!, compressed[f]!];
		for (let k = 1; k < order.length; k++) {
			const [p, q] = [order[k - 1]!, order[k]!];
			const gap = original[q]! - original[p]!;
			const compressedGap = values[q]! - values[p]!;
			if (gap <= enginehorizons.EXACT_SPAN ? compressedGap !== gap : compressedGap <= enginehorizons.EXACT_SPAN) return false; // prettier-ignore
		}
		return true;
	});
}

// Exports ---------------------------------------------------------------------

export default {
	compress,
};
