// src/shared/chess/logic/compression/paths.ts

/**
 * Where other lines cross each slider's path. A slide's landing relates to every line by which
 * side of its crossing it lands on, and how far from it, so compression keeps every path's
 * crossings in order, and the exact gap between two crossings within the span of each other.
 * Those near pairs are kept by adding their squares as points; a far pair a layout loses becomes a
 * separation the next layout holds.
 */

import type { Coords } from '../../../util/coordutil.js';
import type { LineForm } from './lineforms.js';
import type { Separation } from './skeleton.js';
import type { Clustering } from './clustering.js';
import type { SlideLimits } from '../legalmoves.js';

import bimath from '../../../util/math/bimath.js';

import lineforms from './lineforms.js';

// Types -----------------------------------------------------------------------

/** A point that slides along the lines of one form, up to its limits in steps either way. */
export interface Slider {
	point: number;
	form: number;
	limits: SlideLimits;
}

/** A slider's reachable stretch of line, and where other lines cross it, in order along it. */
export interface Path {
	slider: number;
	/** The form of the line slid along. */
	form: number;
	crossings: Crossing[];
	/** Each scaled {@link gap} from one crossing to the next. */
	gaps: bigint[];
}

/**
 * Line `form` of `point`, crossing a path `sign · (its value - the slider's) / along` steps from
 * the slider, where `sign · along` is the form's value of one step along the path.
 */
interface Crossing {
	point: number;
	form: number;
	along: bigint;
	sign: bigint;
}

/** Two neighbouring crossings of a path: the one at `index` and the next. */
interface CrossingPair {
	path: Path;
	index: number;
}

/** Each form's value of each point, undefined where it takes no part. */
type Values = (bigint | undefined)[][];

/** A crossing with its {@link scaledSteps}, and its steps as a double. */
type Placed = { crossing: Crossing; scaled: bigint; steps: number };

// Constants -------------------------------------------------------------------

/** Bounds a double's rounding error relative to the values compared, with ample margin. */
const APPROX_ERROR = 2 ** -50;

// Functions -------------------------------------------------------------------

/**
 * Every slider's path, as far as its slide reaches plus a span beyond, with every line of the first
 * `lineCount` points that crosses it there.
 */
function find(
	forms: readonly LineForm[],
	{ values, orders }: Clustering,
	sliders: readonly Slider[],
	lineCount: number,
	span: bigint,
): Path[] {
	return sliders.map((slider) => {
		const path: Path = { slider: slider.point, form: slider.form, crossings: [], gaps: [] };
		const [low, high] = reach(forms, values, orders, slider, lineCount);
		/** Each form's crossings within reach plus the span, in order along the path. */
		const runs: Placed[][] = [];
		for (let form = 0; form < forms.length; form++) {
			const template = crossingOf(forms, slider.form, 0, form);
			if (!template) continue;
			const own = values[form]![slider.point]!;
			const at = (steps: bigint | null): bigint | undefined => (steps === null ? undefined : own + template.sign * steps * template.along); // prettier-ignore
			const ends = [at(low === null ? null : low - span), at(high === null ? null : high + span)]; // prettier-ignore
			const [from, to] = template.sign > 0n ? ends : ends.reverse();
			const run: Placed[] = [];
			for (const point of within(orders[form]!, values[form]!, from, to)) {
				if (point === slider.point || point >= lineCount) continue;
				const crossing = { ...template, point };
				const scaled = scaledSteps(values, path, crossing);
				run.push({ crossing, scaled, steps: Number(scaled) / Number(crossing.along) });
			}
			runs.push(template.sign > 0n ? run : run.reverse());
		}
		const kept = merge(runs);
		path.crossings = kept.map((entry) => entry.crossing);
		for (let k = 1; k < kept.length; k++) path.gaps.push(kept[k]!.scaled * kept[k - 1]!.crossing.along - kept[k - 1]!.scaled * kept[k]!.crossing.along); // prettier-ignore
		return path;
	});
}

/** Several runs of crossings, each in order along the path, merged into one. */
function merge(runs: Placed[][]): Placed[] {
	const merged: Placed[] = [];
	const heads = runs.map(() => 0);
	for (;;) {
		let best = -1;
		runs.forEach((run, r) => {
			if (heads[r]! < run.length && (best === -1 || isBefore(run[heads[r]!]!, runs[best]![heads[best]!]!))) best = r; // prettier-ignore
		});
		if (best === -1) return merged;
		merged.push(runs[best]![heads[best]!++]!);
	}
}

/**
 * Whether crossing `a` lies before `b`: by their steps as doubles unless rounding could reverse
 * them, exactly otherwise.
 */
function isBefore(a: Placed, b: Placed): boolean {
	const difference = a.steps - b.steps;
	if (Math.abs(difference) > (Math.abs(a.steps) + Math.abs(b.steps)) * APPROX_ERROR + 1) return difference < 0; // prettier-ignore
	return a.scaled * b.crossing.along < b.scaled * a.crossing.along;
}

/** Where line `form` of `point` crosses lines of `pathForm`, or undefined if they're parallel. */
function crossingOf(
	forms: readonly LineForm[],
	pathForm: number,
	point: number,
	form: number,
): Crossing | undefined {
	const step = lineforms.value(forms[form]!, lineforms.direction(forms[pathForm]!));
	if (step === 0n) return undefined;
	return { point, form, along: bimath.abs(step), sign: step > 0n ? 1n : -1n };
}

/**
 * How many steps the slider may go either way: to its limits, and onto the first squares on its
 * line.
 */
function reach(
	forms: readonly LineForm[],
	values: Values,
	orders: number[][],
	slider: Slider,
	lineCount: number,
): [bigint | null, bigint | null] {
	let [low, high] = slider.limits;
	const own = values[slider.form]![slider.point]!;
	// Any other form counts the steps along the line, by its value of one.
	const counter = forms.findIndex((_, form) => crossingOf(forms, slider.form, 0, form) !== undefined); // prettier-ignore
	const { along, sign } = crossingOf(forms, slider.form, 0, counter)!;
	for (const point of within(orders[slider.form]!, values[slider.form]!, own, own)) {
		const value = values[counter]![point];
		if (point === slider.point || point >= lineCount || value === undefined) continue; // A lone line blocks nothing.
		const steps = (sign * (value - values[counter]![slider.point]!)) / along;
		if (steps > 0n && (high === null || steps < high)) high = steps;
		if (steps < 0n && (low === null || steps > low)) low = steps;
	}
	return [low, high];
}

/** The points of `order` whose values lie from `from` to `to`, either end open when undefined. */
function* within(
	order: number[],
	formValues: (bigint | undefined)[],
	from: bigint | undefined,
	to: bigint | undefined,
): Generator<number> {
	let [low, high] = [0, order.length];
	while (from !== undefined && low < high) {
		const mid = (low + high) >>> 1;
		if (formValues[order[mid]!]! < from) low = mid + 1;
		else high = mid;
	}
	for (let k = low; k < order.length && (to === undefined || formValues[order[k]!]! <= to); k++) yield order[k]!; // prettier-ignore
}

/** How many steps from the slider a crossing lies, times its `along`. */
function scaledSteps(values: Values, path: Path, crossing: Crossing): bigint {
	return crossing.sign * (values[crossing.form]![crossing.point]! - values[crossing.form]![path.slider]!); // prettier-ignore
}

/** How many steps `b` lies past `a`, times `a.along · b.along`. */
function gap(values: Values, path: Path, a: Crossing, b: Crossing): bigint {
	return scaledSteps(values, path, b) * a.along - scaledSteps(values, path, a) * b.along;
}

/** Whether a scaled {@link gap} between `a` and `b` is within `span` steps. */
function isNear(scaledGap: bigint, a: Crossing, b: Crossing, span: bigint): boolean {
	return bimath.abs(scaledGap) <= span * a.along * b.along;
}

/**
 * The squares at and around every crossing lying within the span of its neighbour, unless their
 * gap is already fixed.
 * @param isFixed - Whether the clusters' links already fix a separation's sum.
 */
function meetings(
	forms: readonly LineForm[],
	values: Values,
	coords: readonly Coords[],
	paths: readonly Path[],
	span: bigint,
	isFixed: (separation: Separation) => boolean,
): Coords[] {
	const squares: Coords[] = [];
	for (const path of paths) {
		path.gaps.forEach((originalGap, index) => {
			const [a, b] = [path.crossings[index]!, path.crossings[index + 1]!];
			if (!isNear(originalGap, a, b, span) || isFixed(separation({ path, index }))) return;
			squares.push(...bracket(forms, values, coords, path, a), ...bracket(forms, values, coords, path, b)); // prettier-ignore
		});
	}
	return squares;
}

/** The squares of a path at a crossing: just it when whole, else the two either side. */
function bracket(
	forms: readonly LineForm[],
	values: Values,
	coords: readonly Coords[],
	path: Path,
	crossing: Crossing,
): Coords[] {
	const scaled = scaledSteps(values, path, crossing);
	const below = (scaled - bimath.posMod(scaled, crossing.along)) / crossing.along;
	const [dx, dy] = lineforms.direction(forms[path.form]!);
	const [x, y] = coords[path.slider]!;
	const at = (steps: bigint): Coords => [x + steps * dx, y + steps * dy];
	return below * crossing.along === scaled ? [at(below)] : [at(below), at(below + 1n)];
}

/**
 * Every neighbouring pair of crossings whose relation `compressed` loses: out of order, or within
 * the span when it was beyond it. Undefined when an exact gap within the span was lost, which
 * {@link meetings} keeps, so no constraint can repair it.
 */
function lostPairs(
	paths: readonly Path[],
	compressed: Values,
	span: bigint,
): CrossingPair[] | undefined {
	const lost: CrossingPair[] = [];
	for (const path of paths) {
		for (let index = 0; index < path.gaps.length; index++) {
			const [a, b] = [path.crossings[index]!, path.crossings[index + 1]!];
			const originalGap = path.gaps[index]!;
			const compressedGap = gap(compressed, path, a, b);
			if (isNear(originalGap, a, b, span)) {
				if (compressedGap !== originalGap) return undefined;
			} else if (compressedGap < 0n || isNear(compressedGap, a, b, span)) {
				lost.push({ path, index });
			}
		}
	}
	return lost;
}

/** The layout separation holding a pair's second crossing past its first, beyond the span. */
function separation({ path, index }: CrossingPair): Separation {
	const [a, b] = [path.crossings[index]!, path.crossings[index + 1]!];
	const scale = a.along * b.along;
	return {
		terms: [
			[b.point, b.form, a.along * b.sign],
			[path.slider, b.form, -a.along * b.sign],
			[a.point, a.form, -b.along * a.sign],
			[path.slider, a.form, b.along * a.sign],
		],
		scale,
		gap: path.gaps[index]! / scale,
	};
}

// Exports ---------------------------------------------------------------------

export default {
	find,
	meetings,
	lostPairs,
	separation,
};
