// src/shared/chess/logic/compression/skeleton.ts

/**
 * Lays out a position's rigid clusters as small as they go, measured in units of `unit` squares.
 * A linear program: links hold their clusters' shared values fixed, and each far gap shrinks to
 * about one unit, jittered so the compressed gaps relate to each other as generically as the
 * original astronomical ones did. Further separations hold any other far gap past the span, and
 * every point stays within the bound.
 */

import type { Constraint, Model } from 'yalps';
import type { Coords } from '../../../util/coordutil.js';
import type { LineForm } from './lineforms.js';
import type { Clustering, CompressionPoint, Link } from './clustering.js';

import { solve } from 'yalps';

import bimath from '../../../util/math/bimath.js';

import lineforms from './lineforms.js';
import linkspace from './linkspace.js';
import clustering from './clustering.js';

// Types -----------------------------------------------------------------------

/** Each cluster's position in units, relative to the home cluster. */
export type Layout = { x: Float64Array; y: Float64Array };

/**
 * The scale of a layout: its unit, the exact span, and the bound every coordinate stays within, in
 * squares.
 */
export interface LayoutScale {
	unit: bigint;
	span: bigint;
	bound: bigint;
}

/**
 * A far gap besides the neighbours under each form: `Σ coefficient · value of point under form`,
 * which is `scale · gap` with `gap` beyond the span, and must stay so.
 */
export interface Separation {
	terms: [point: number, form: number, coefficient: bigint][];
	scale: bigint;
	gap: bigint;
}

// Constants -------------------------------------------------------------------

/**
 * A far gap the layout can't grow keeps this fraction of its original size as slack,
 * so a cluster wedged between another cluster's points still has room to sit.
 */
const MODERATE_GAP_SLACK = 20n;

/**
 * The solver's zero tolerances, in units, tried in turn. Rounding can make one report a feasible
 * layout infeasible, or return a layout breaking its constraints, and which fails depends on it.
 */
const SOLVER_PRECISIONS = [1e-8, 1e-6, 1e-10];

// Functions -------------------------------------------------------------------

/**
 * The layouts the solver finds, one per tolerance that solves, for the caller to verify in turn.
 * @param random - Draws each far gap's jitter, in [0, 1).
 */
function* lay(
	points: readonly CompressionPoint[],
	forms: readonly LineForm[],
	structure: Clustering,
	home: number,
	scale: LayoutScale,
	separations: readonly Separation[],
	random: () => number,
): Generator<Layout> {
	const { clusters } = structure;
	const model = new ModelBuilder(clusters.length, home);
	for (const link of independentLinks(forms, structure.links, home, clusters.length)) {
		const form = forms[link.form]!;
		const shared = anchorDifference(points, clusters, form, link.a, link.b);
		model.add(form, link.a, link.b, { equal: Number(shared) / Number(scale.unit) });
	}
	addBounds(points, forms, structure, home, scale, model);
	addFarGaps(points, forms, structure, scale, random, model);
	addSeparations(points, forms, structure, scale, separations, random, model);
	model.minimizeSpan(forms, structure);

	const built = model.build();
	for (const precision of SOLVER_PRECISIONS) {
		const solution = solve(built, { includeZeroVariables: true, precision });
		if (solution.status === 'optimal') yield model.read(solution.variables);
	}
}

/**
 * The links whose equations don't follow from home's pin and the links kept before them. A cycle
 * of links makes its last one redundant, and the solver's elimination can trip over redundant
 * equalities; placement still holds every link exactly.
 */
function independentLinks(
	forms: readonly LineForm[],
	links: Link[],
	home: number,
	clusterCount: number,
): Link[] {
	const basis = linkspace.create();
	linkspace.add(basis, clusterCount, [[2 * home, 1n]]);
	linkspace.add(basis, clusterCount, [[2 * home + 1, 1n]]);
	return links.filter((link) => linkspace.add(basis, clusterCount, linkspace.linkSum(forms, link))); // prettier-ignore
}

/**
 * Holds every cluster's points within the bound around home, which keeps its place. Besides the
 * promise itself, this keeps the solver's values small enough for its rounding.
 */
function addBounds(
	points: readonly CompressionPoint[],
	forms: readonly LineForm[],
	{ clusters }: Clustering,
	home: number,
	scale: LayoutScale,
	model: ModelBuilder,
): void {
	const homeAt = points[clusters[home]![0]!]!.coords;
	clusters.forEach((members, c) => {
		if (c === home) return;
		const anchor = points[members[0]!]!.coords;
		for (const axis of [0, 1] as const) {
			let [low, high] = [-scale.bound, scale.bound];
			for (const i of members) {
				if (!clustering.usesAxis(forms, points[i]!, axis)) continue;
				const offset = points[i]!.coords[axis] - anchor[axis];
				[low, high] = [bimath.max(low, -scale.bound - offset), bimath.min(high, scale.bound - offset)]; // prettier-ignore
			}
			const toUnits = (value: bigint): number =>
				Number(value - homeAt[axis]) / Number(scale.unit);
			model.constrain([[2 * c + axis, 1]], { min: toUnits(low), max: toUnits(high) });
		}
	});
}

/** How far apart two clusters' anchors sit under `form`. */
function anchorDifference(
	points: readonly CompressionPoint[],
	clusters: number[][],
	form: LineForm,
	a: number,
	b: number,
): bigint {
	const anchor = (c: number): Coords => points[clusters[c]![0]!]!.coords;
	return lineforms.value(form, anchor(a)) - lineforms.value(form, anchor(b));
}

/**
 * Requires every far gap between two clusters' neighbouring points to stay far ({@link farBound}).
 */
function addFarGaps(
	points: readonly CompressionPoint[],
	forms: readonly LineForm[],
	structure: Clustering,
	scale: LayoutScale,
	random: () => number,
	model: ModelBuilder,
): void {
	const { values, orders, classes, clusterOf, clusters } = structure;
	orders.forEach((order, f) => {
		/**
		 * The tightest bound between each pair of clusters, as several of their points may
		 * neighbour.
		 */
		const bounds = new Map<number, { above: number; below: number; minimum: bigint }>();
		for (let k = 1; k < order.length; k++) {
			const [p, q] = [order[k - 1]!, order[k]!];
			const [cp, cq] = [clusterOf[p]!, clusterOf[q]!];
			if (classes[f]![p] === classes[f]![q] || cp === cq) continue;
			const gap = values[f]![q]! - values[f]![p]!;
			// Points sit at their cluster's anchor plus a fixed offset, which the bound absorbs.
			const minimum = farBound(gap, scale, random) - (anchorOffset(points, forms, structure, q, f) - anchorOffset(points, forms, structure, p, f)); // prettier-ignore
			const pair = cq * clusters.length + cp;
			const existing = bounds.get(pair);
			if (!existing || minimum > existing.minimum)
				bounds.set(pair, { above: cq, below: cp, minimum });
		}
		for (const { above, below, minimum } of bounds.values()) {
			model.add(forms[f]!, above, below, { min: Number(minimum) / Number(scale.unit) });
		}
	});
}

/**
 * Requires each separation's sum to stay as far as {@link farBound} holds its gap. Separations whose
 * sums move with the clusters alike, as many crossings of one cluster's lines do, share one bound.
 */
function addSeparations(
	points: readonly CompressionPoint[],
	forms: readonly LineForm[],
	structure: Clustering,
	scale: LayoutScale,
	separations: readonly Separation[],
	random: () => number,
	model: ModelBuilder,
): void {
	/** The tightest bound, in units, on each distinct sum with coprime coefficients. */
	const bounds = new Map<string, { terms: [number, number][]; minimum: number }>();
	for (const separation of separations) {
		const terms = linkspace.combine(linkspace.separationSum(forms, structure.clusterOf, separation)); // prettier-ignore
		if (terms.length === 0) continue; // Rigid: its gap can't change.
		const divisor = terms.reduce((gcd, [, coefficient]) => bimath.GCD(gcd, coefficient), 0n);
		let offsets = 0n;
		for (const [point, f, coefficient] of separation.terms) offsets += coefficient * anchorOffset(points, forms, structure, point, f); // prettier-ignore
		const minimum = Number(separation.scale * farBound(separation.gap, scale, random) - offsets) / Number(divisor * scale.unit); // prettier-ignore
		const key = terms
			.map(([variable, coefficient]) => `${variable}:${coefficient / divisor}`)
			.join(',');
		const existing = bounds.get(key);
		if (!existing || minimum > existing.minimum) bounds.set(key, { terms: terms.map(([variable, coefficient]) => [variable, Number(coefficient / divisor)]), minimum }); // prettier-ignore
	}
	for (const { terms, minimum } of bounds.values()) model.constrain(terms, { min: minimum });
}

/**
 * How small a far gap may shrink: one unit plus jitter, or its original size when that's smaller,
 * less {@link MODERATE_GAP_SLACK}, but always beyond the span.
 */
function farBound(gap: bigint, scale: LayoutScale, random: () => number): bigint {
	const jittered = scale.unit + 1n + BigInt(Math.floor(random() * Number(scale.unit)));
	const moderate = bimath.max(scale.span + 1n, gap - (gap >> MODERATE_GAP_SLACK));
	return bimath.min(jittered, moderate);
}

/** A point's value under form `f`, less its cluster anchor's. */
function anchorOffset(
	points: readonly CompressionPoint[],
	forms: readonly LineForm[],
	{ values, clusterOf, clusters }: Clustering,
	point: number,
	f: number,
): bigint {
	return values[f]![point]! - lineforms.value(forms[f]!, points[clusters[clusterOf[point]!]![0]!]!.coords); // prettier-ignore
}

// Model Building --------------------------------------------------------------

/**
 * Accumulates the linear program over each cluster's (x, y) relative to home, which sits at the
 * origin: variable `2c` is cluster c's x and `2c + 1` its y. Constraint keys count up from 1;
 * key 0 is the objective. The solver only takes nonnegative variables, so each is split into a
 * positive and a negative part, keeping every value as small as the layout itself.
 */
class ModelBuilder {
	private readonly coefficients = new Map<number, Map<number, number>>();
	private readonly constraints = new Map<number, Constraint>();
	private nextKey = 1;

	constructor(
		private readonly clusterCount: number,
		private readonly home: number,
	) {}

	/** Bounds `form`'s value of cluster `a` minus cluster `b`. */
	add(form: LineForm, a: number, b: number, bound: Constraint): void {
		const terms: [number, number][] = [];
		if (form.a !== 0n) terms.push([2 * a, Number(form.a)], [2 * b, -Number(form.a)]);
		if (form.b !== 0n) terms.push([2 * a + 1, Number(form.b)], [2 * b + 1, -Number(form.b)]);
		this.constrain(terms, bound);
	}

	/**
	 * Minimizes the position's width plus height. Compression keeps every order, so
	 * the clusters at either end of each axis are known ahead, and the span is linear.
	 */
	minimizeSpan(forms: readonly LineForm[], structure: Clustering): void {
		for (const axis of [0, 1] as const) {
			const order = structure.orders[forms.findIndex((form) => (axis === 0 ? form.b : form.a) === 0n)]!; // prettier-ignore
			this.term(2 * structure.clusterOf[order.at(-1)!]! + axis, 0, 1);
			this.term(2 * structure.clusterOf[order[0]!]! + axis, 0, -1);
		}
	}

	build(): Model<number, number> {
		return {
			direction: 'minimize',
			objective: 0,
			constraints: this.constraints,
			variables: this.coefficients,
		};
	}

	/** Each cluster's solved position, relative to home. */
	read(variables: [number, number][]): Layout {
		const layout: Layout = { x: new Float64Array(this.clusterCount), y: new Float64Array(this.clusterCount) }; // prettier-ignore
		for (const [part, value] of variables) {
			const variable = part >> 1;
			const axis = variable % 2 === 0 ? layout.x : layout.y;
			axis[variable >> 1]! += part % 2 === 0 ? value : -value;
		}
		return layout;
	}

	/** Bounds the sum of `terms`, as [variable, coefficient] pairs. */
	constrain(terms: [number, number][], bound: Constraint): void {
		const key = this.nextKey++;
		this.constraints.set(key, bound);
		for (const [variable, coefficient] of terms) this.term(variable, key, coefficient);
	}

	/**
	 * Adds `coefficient` times a variable to constraint `key`, through its two parts; home's are
	 * zero.
	 */
	private term(variable: number, key: number, coefficient: number): void {
		if (variable >> 1 === this.home) return;
		for (const [part, sign] of [
			[2 * variable, 1],
			[2 * variable + 1, -1],
		] as const) {
			let row = this.coefficients.get(part);
			if (!row) this.coefficients.set(part, (row = new Map()));
			row.set(key, (row.get(key) ?? 0) + sign * coefficient);
		}
	}
}

// Exports ---------------------------------------------------------------------

export default {
	lay,
};
