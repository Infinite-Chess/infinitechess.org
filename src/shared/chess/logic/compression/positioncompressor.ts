// src/shared/chess/logic/compression/positioncompressor.ts

/**
 * Compresses a position's points within a coordinate bound, so that any move keeps its relations.
 *
 * Under every line form, two points within the span keep their exact difference, and points
 * further apart keep their order and stay beyond it. So do the lines crossing every slider's path
 * ({@link paths}), so any landing has a counterpart. Every coordinate keeps its residue, so lines
 * still cross on the same squares. The origin's cluster stays put. Every result is verified.
 */

import type { Coords } from '../../../util/coordutil.js';
import type { LineForm } from './lineforms.js';
import type { Path, Slider } from './paths.js';
import type { LayoutScale, Separation } from './skeleton.js';
import type { Clustering, CompressionPoint } from './clustering.js';

import bimath from '../../../util/math/bimath.js';

import paths from './paths.js';
import skeleton from './skeleton.js';
import lineforms from './lineforms.js';
import placement from './placement.js';
import clustering from './clustering.js';
import linkspace from './linkspace.js';

// Types -----------------------------------------------------------------------

/** A position to compress, as the points whose relations must survive. */
interface CompressionInput {
	points: CompressionPoint[];
	/** How many leading points the position's lines pass through: its pieces and lone lines. */
	lineCount: number;
	/** Every line form the position's pieces relate along. */
	forms: LineForm[];
	sliders: Slider[];
}

/** What a compression must keep, and where it must fit. */
export interface CompressionOptions {
	/**
	 * Every relation within this many squares stays exact through any move, and farther ones keep
	 * only their order: distances beyond it are arbitrary.
	 */
	arbitraryDistance: bigint;
	/** Compressed coordinates stay within ±this. */
	bound: bigint;
	/** Every square keeps its residue modulo this too. */
	grid: bigint;
}

// Constants -------------------------------------------------------------------

/**
 * The unit far gaps shrink to, as the span shifted left by `shift`, and the jitter seed, of each
 * attempt in turn. Smaller units fit deeper orders within the bound; fresh jitter breaks an
 * accidental alignment the last one made.
 */
const ATTEMPTS: { shift: bigint; seed: number }[] = [
	{ shift: 8n, seed: 1 },
	{ shift: 8n, seed: 2 },
	{ shift: 1n, seed: 3 },
	{ shift: 0n, seed: 4 },
];

/** How many times an attempt adds the separations its layout lost and lays out again. */
const SEPARATION_ROUNDS = 8;

// Functions -------------------------------------------------------------------

/**
 * Each point's compressed coordinates, or undefined when they can't all be kept within the bound.
 * Each attempt lays the clusters out, adds the separations along paths the layout lost, and lays
 * them out again.
 */
function compress(input: CompressionInput, options: CompressionOptions): Coords[] | undefined {
	const modulus = lineforms.residueModulus(input.forms, options.grid);
	const span = spanOf(options.arbitraryDistance, modulus);
	const origin = input.points.length;
	const { points, structure, pathList } = withMeetings(input, [...input.points, { coords: [0n, 0n] }], span); // prettier-ignore
	const home = structure.clusterOf[origin]!;
	const separations: Separation[] = [];
	/** The largest unit too coarse to fit the separations found so far, which only grow. */
	let tooCoarse: bigint | undefined;
	for (const { shift, seed } of ATTEMPTS) {
		const unit = span << shift;
		if (tooCoarse !== undefined && unit >= tooCoarse) continue;
		const scale: LayoutScale = { unit, span, bound: options.bound };
		const random = seededRandom(seed);
		for (let round = 0; round < SEPARATION_ROUNDS; round++) {
			let placed: { coords: Coords[]; lost: Separation[] } | undefined;
			const layouts = skeleton.lay(points, input.forms, structure, home, scale, separations, random); // prettier-ignore
			for (const layout of layouts) {
				const coords = placement.place(points, input.forms, structure, layout, home, unit, modulus); // prettier-ignore
				const lost = coords && verify(input.forms, points, structure, pathList, coords, { ...options, modulus, span }); // prettier-ignore
				if (lost) {
					placed = { coords: coords!, lost };
					break;
				}
			}
			if (!placed) {
				if (separations.length > 0) tooCoarse = unit;
				break;
			}
			if (placed.lost.length === 0) return placed.coords.slice(0, input.points.length);
			separations.push(...placed.lost);
		}
	}
	return undefined;
}

/**
 * Within how many squares compression keeps gaps exact. A slide landing beyond the arbitrary
 * distance of both crossings around it needs that room past each, plus a residue's worth.
 */
function spanOf(arbitraryDistance: bigint, modulus: bigint): bigint {
	return 2n * (arbitraryDistance + 1n) + modulus;
}

/**
 * Adds, as points of their own, the squares around every two crossings of a path within the span
 * of each other, so compression keeps their gap. A square within a third of the span of a point
 * already shares that point's classes in every form, which keeps it without help.
 */
function withMeetings(
	input: CompressionInput,
	basePoints: CompressionPoint[],
	span: bigint,
): { points: CompressionPoint[]; structure: Clustering; pathList: Path[] } {
	const base = clustering.build(basePoints, input.forms, span);
	const pathList = paths.find(input.forms, base, input.sliders, input.lineCount, span);
	const coords = basePoints.map((point) => point.coords);
	const meetings = paths.meetings(input.forms, base.values, coords, pathList, span, linkspace.fixer(input.forms, base)); // prettier-ignore
	const reach = span / maxCoefficientSum(input.forms);
	const added = new Map<string, Coords>();
	for (const square of meetings) {
		if (!isNearAnyPoint(input.forms, base, square, reach)) added.set(`${square[0]},${square[1]}`, square); // prettier-ignore
	}
	if (added.size === 0) return { points: basePoints, structure: base, pathList };

	const points = [...basePoints, ...[...added.values()].map((coords) => ({ coords }))];
	return { points, structure: clustering.build(points, input.forms, span), pathList };
}

/** The most a square's value can change, under any form, per square it moves on either axis. */
function maxCoefficientSum(forms: readonly LineForm[]): bigint {
	return forms.reduce((most, { a, b }) => bimath.max(most, bimath.abs(a) + bimath.abs(b)), 1n);
}

/** Whether a square of `structure` lies within `reach` of `square`, on both axes. */
function isNearAnyPoint(
	forms: readonly LineForm[],
	structure: Clustering,
	square: Coords,
	reach: bigint,
): boolean {
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
 * The separations `coords` loses along the paths, none when it keeps everything compression
 * promises, or undefined when it loses something no separation repairs: the bound, a residue,
 * an exact difference or far order under some form, or an exact gap along a path.
 */
function verify(
	forms: readonly LineForm[],
	points: readonly CompressionPoint[],
	structure: Clustering,
	pathList: readonly Path[],
	coords: Coords[],
	{ bound, modulus, span }: { bound: bigint; modulus: bigint; span: bigint },
): Separation[] | undefined {
	for (let i = 0; i < points.length; i++) {
		for (const axis of [0, 1] as const) {
			if (!clustering.usesAxis(forms, points[i]!, axis)) continue;
			if (bimath.abs(coords[i]![axis]) > bound) return undefined;
			if ((coords[i]![axis] - points[i]!.coords[axis]) % modulus !== 0n) return undefined;
		}
	}
	const values = structure.values.map(
		(formValues, f) =>
		formValues.map((value, i) => (value === undefined ? undefined : lineforms.value(forms[f]!, coords[i]!))), // prettier-ignore
	);
	if (!keepsEveryGap(structure, values, span)) return undefined;
	return paths.lostPairs(pathList, values, span)?.map((pair) => paths.separation(pair));
}

/**
 * Whether every gap between neighbours under every form is kept: exactly within the span,
 * beyond it otherwise. Every pair's relation is a sum of such gaps, so this keeps them all.
 */
function keepsEveryGap(
	structure: Clustering,
	compressed: (bigint | undefined)[][],
	span: bigint,
): boolean {
	return structure.orders.every((order, f) => {
		const [original, values] = [structure.values[f]!, compressed[f]!];
		for (let k = 1; k < order.length; k++) {
			const [p, q] = [order[k - 1]!, order[k]!];
			const gap = original[q]! - original[p]!;
			const compressedGap = values[q]! - values[p]!;
			if (gap <= span ? compressedGap !== gap : compressedGap <= span) return false;
		}
		return true;
	});
}

// Exports ---------------------------------------------------------------------

export default {
	compress,
};
