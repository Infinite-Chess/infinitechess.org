// src/client/scripts/esm/views/analysis/compression/crossings.ts

/**
 * Finds where a slider can land on two other pieces' lines at once. A slider stops where its
 * line crosses another piece's line, and a square there that also passes within
 * {@link enginehorizons.NEAR_LINE_SPAN} of a third piece's line is a fork, a block, or a landing
 * under attack. Per-form compression keeps two-point relations exact, but such a three-line
 * meeting far from every piece depends on three far gaps at once, so it is checked directly.
 */

import type { Coords } from '../../../../../../shared/util/coordutil.js';
import type { LineForm } from './lineforms.js';
import type { Clustering } from './clustering.js';

import bimath from '../../../../../../shared/util/math/bimath.js';

import lineforms from './lineforms.js';
import enginehorizons from './enginehorizons.js';

// Types -----------------------------------------------------------------------

/** A point that slides, and the forms (indices) of the lines it slides along. */
export interface Slider {
	point: number;
	forms: number[];
}

/**
 * Every crossing within reach of a third line, keyed `slider:form:other:form:third:form`, valued by
 * its offset from the third line. A triple whose three lines all share a class with one cluster is
 * left out: each line moves with that cluster, so the meeting moves as one.
 */
type Meetings = Map<string, bigint>;

// Constants -------------------------------------------------------------------

/**
 * Values are searched as doubles, then confirmed exactly. Only values past 2^APPROX_BITS are
 * scaled down, to stay within double range; each double is then within a unit of its scaled value
 * plus {@link RELATIVE_ERROR} of its size.
 */
const APPROX_BITS = 1000;
/** Bounds a double's rounding error relative to the values it's computed from, with ample margin. */
const RELATIVE_ERROR = 2 ** -50;

/** See {@link findCompactClusters}. */
const COMPACT_WIDTH = (enginehorizons.EXACT_SPAN - enginehorizons.NEAR_LINE_SPAN) / 18n;

// Functions -------------------------------------------------------------------

/**
 * Every crossing of a slider's line with a second point's line that passes within the near-line
 * span of a third point's line, under the given values (original or compressed) of each point.
 * @param ownPoints - Points from this index on are crossing points added to pin meetings in place,
 *   not pieces, so their own lines take no part.
 */
function find(
	forms: readonly LineForm[],
	sliders: readonly Slider[],
	clustering: Clustering,
	values: (bigint | undefined)[][],
	ownPoints: number,
): Meetings {
	const approx = approximate(values);
	const compact = findCompactClusters(forms, clustering, values);
	const classClusters = clustering.classes.map((classOf) => {
		const sets: Set<number>[] = [];
		classOf.forEach((k, i) => {
			if (k !== -1) (sets[k] ??= new Set()).add(clustering.clusterOf[i]!);
		});
		return sets;
	});
	const meetings: Meetings = new Map();
	for (const slider of sliders) {
		for (const fd of slider.forms) {
			for (let f2 = 0; f2 < forms.length; f2++) {
				if (f2 === fd) continue;
				for (let f3 = 0; f3 < forms.length; f3++) {
					if (f3 === fd || f3 === f2) continue;
					const families = { p1: slider.point, fd, f2, f3, ownPoints };
					findForFamilies(
						forms,
						clustering,
						values,
						approx,
						{ compact, classClusters },
						meetings,
						families,
					);
				}
			}
		}
	}
	return meetings;
}

/**
 * Which clusters are narrow enough that a crossing of two of their own lines can't meet a line
 * outside their classes. Two lines through squares w apart cross within 6w of them, which moves
 * any form's value at most 18w, so below {@link COMPACT_WIDTH} every near third line shares a
 * class with the cluster and moves with it.
 */
function findCompactClusters(
	forms: readonly LineForm[],
	{ clusterOf, clusters }: Clustering,
	values: (bigint | undefined)[][],
): boolean[] {
	const clusterCount = clusters.length;
	const compact = new Array<boolean>(clusterCount).fill(true);
	for (const axisForm of [
		forms.findIndex((form) => form.b === 0n),
		forms.findIndex((form) => form.a === 0n),
	]) {
		const [low, high] = [new Array<bigint | undefined>(clusterCount), new Array<bigint | undefined>(clusterCount)]; // prettier-ignore
		values[axisForm]!.forEach((value, i) => {
			if (value === undefined) return;
			const c = clusterOf[i]!;
			low[c] = low[c] === undefined ? value : bimath.min(low[c], value);
			high[c] = high[c] === undefined ? value : bimath.max(high[c], value);
		});
		low.forEach((lowest, c) => {
			if (high[c]! - lowest! > COMPACT_WIDTH) compact[c] = false;
		});
	}
	return compact;
}

/** Each value scaled down into double range, and the scale's exponent. */
function approximate(values: (bigint | undefined)[][]): { scaled: Float64Array[]; shift: bigint } {
	let largest = 0n;
	for (const formValues of values) {
		for (const value of formValues) {
			if (value !== undefined) largest = bimath.max(largest, bimath.abs(value));
		}
	}
	const shift = BigInt(Math.max(0, bimath.bitLength_bisection(largest) - APPROX_BITS));
	const scaled = values.map((formValues) =>
		Float64Array.from(formValues, (value) =>
			value === undefined ? NaN : Number(value >> shift),
		),
	);
	return { scaled, shift };
}

/**
 * Records the meetings of slider `p1`'s `fd` line with every `f2` line, near every `f3` line. With
 * c1, c2, c3 the three lines' values, the crossing sits at `f3 = (A·c1 + B·c2) / det`, so for each
 * second line the third lines in reach are a binary search away.
 */
function findForFamilies(
	forms: readonly LineForm[],
	clustering: Clustering,
	values: (bigint | undefined)[][],
	approx: { scaled: Float64Array[]; shift: bigint },
	{ compact, classClusters }: { compact: boolean[]; classClusters: Set<number>[][] },
	meetings: Meetings,
	{ p1, fd, f2, f3, ownPoints }: { p1: number; fd: number; f2: number; f3: number; ownPoints: number }, // prettier-ignore
): void {
	const [formD, form2, form3] = [forms[fd]!, forms[f2]!, forms[f3]!];
	const det = lineforms.determinant(formD, form2);
	const A = lineforms.determinant(form3, form2);
	const B = lineforms.determinant(formD, form3);
	const c1 = values[fd]![p1]!;
	const [scaled2, scaled3] = [approx.scaled[f2]!, approx.scaled[f3]!];
	const order3 = clustering.orders[f3]!;
	const [detN, aN, bN, c1N] = [Number(det), Number(A), Number(B), approx.scaled[fd]![p1]!];
	// The span, plus each of the three values' unit of scaling error carried through the formula.
	const fixedWindow = Number(enginehorizons.NEAR_LINE_SPAN >> approx.shift) + 1 + (Math.abs(aN) + Math.abs(bN)) / Math.abs(detN); // prettier-ignore
	const bound = bimath.abs(det) * enginehorizons.NEAR_LINE_SPAN;
	const { clusterOf, classes } = clustering;
	const clusters1 = classClusters[fd]![classes[fd]![p1]!]!;

	for (const p2 of clustering.orders[f2]!) {
		if (p2 === p1 || p2 >= ownPoints) continue;
		if (clusterOf[p2] === clusterOf[p1] && compact[clusterOf[p1]!]) continue; // Moves as one with every line near it.
		const [term1, term2] = [aN * c1N, bN * scaled2[p2]!];
		const target = (term1 + term2) / detN;
		// Rounding grows with the terms the target is computed from, and with the third value's size.
		const window = fixedWindow + RELATIVE_ERROR * ((Math.abs(term1) + Math.abs(term2)) / Math.abs(detN) + Math.abs(target)); // prettier-ignore
		const c2 = values[f2]![p2]!;
		const clusters2 = classClusters[f2]![classes[f2]![p2]!]!;
		for (let k = lowerBound(order3, scaled3, target - window); k < order3.length; k++) {
			const q = order3[k]!;
			if (scaled3[q]! > target + window) break;
			if (q >= ownPoints) continue;
			const clusters3 = classClusters[f3]![classes[f3]![q]!]!;
			if ([...clusters1].some((c) => clusters2.has(c) && clusters3.has(c))) continue;
			const offsetTimesDet = A * c1 + B * c2 - det * values[f3]![q]!;
			if (bimath.abs(offsetTimesDet) > bound) continue;
			if (lineforms.crossing(formD, c1, form2, c2) === undefined) continue;
			meetings.set(`${p1}:${fd}:${p2}:${f2}:${q}:${f3}`, offsetTimesDet / det);
		}
	}
}

/** The first position in `order` whose scaled value is at least `target`. */
function lowerBound(order: number[], scaled: Float64Array, target: number): number {
	let [low, high] = [0, order.length];
	while (low < high) {
		const mid = (low + high) >>> 1;
		if (scaled[order[mid]!]! < target) low = mid + 1;
		else high = mid;
	}
	return low;
}

/** The distinct squares the meetings land on. */
function squares(
	forms: readonly LineForm[],
	values: (bigint | undefined)[][],
	meetings: Meetings,
): Coords[] {
	const landings = new Map<string, Coords>();
	for (const key of meetings.keys()) {
		const landing = key.split(':', 4).join(':');
		if (landings.has(landing)) continue;
		const [p1, fd, p2, f2] = landing.split(':').map(Number) as [number, number, number, number];
		landings.set(landing, lineforms.crossing(forms[fd]!, values[fd]![p1]!, forms[f2]!, values[f2]![p2]!)!); // prettier-ignore
	}
	return [...landings.values()];
}

// Exports ---------------------------------------------------------------------

export default {
	find,
	squares,
};
