// src/client/scripts/esm/views/analysis/compression/skeleton.ts

/**
 * Lays out a position's rigid clusters as small as they go, measured in units of `unit` squares.
 * A linear program: links hold their clusters' shared values fixed, and each far gap shrinks to
 * about one unit, jittered so the compressed gaps relate to each other as generically as the
 * original astronomical ones did.
 */

import type { Constraint, Model } from 'yalps';
import type { Coords } from '../../../../../../shared/util/coordutil.js';
import type { LineForm } from './lineforms.js';
import type { Clustering, CompressionPoint, Link } from './clustering.js';

import { solve } from 'yalps';

import bimath from '../../../../../../shared/util/math/bimath.js';

import lineforms from './lineforms.js';
import enginehorizons from './enginehorizons.js';

// Types -----------------------------------------------------------------------

/** Each cluster's position in units, relative to the home cluster. */
export type Layout = { x: Float64Array; y: Float64Array };

// Constants -------------------------------------------------------------------

/**
 * A far gap the layout can't grow keeps this fraction of its original size as slack,
 * so a cluster wedged between another cluster's points still has room to sit.
 */
const MODERATE_GAP_SLACK = 20n;

/** A prime below 2^26, so a product of two residues stays exact in a double. */
const RANK_PRIME = 67108859;

/**
 * The solver's zero tolerance, in units. Placement makes the layout exact, so it need only be
 * close; the solver's far tighter default reports wide layouts infeasible on rounding alone.
 */
const SOLVER_PRECISION = 1e-6;

// Functions -------------------------------------------------------------------

/**
 * Solves the layout, or undefined when the solver finds none.
 * @param reach - How far below home, in squares, a cluster may be laid.
 * @param random - Draws each far gap's jitter, in [0, 1).
 */
function lay(
	points: readonly CompressionPoint[],
	forms: readonly LineForm[],
	clustering: Clustering,
	home: number,
	unit: bigint,
	reach: bigint,
	random: () => number,
): Layout | undefined {
	const { clusters } = clustering;
	const model = new ModelBuilder(clusters.length, Number(reach / unit));

	model.fix(home);
	for (const link of independentLinks(forms, clustering.links, home, clusters.length)) {
		const form = forms[link.form]!;
		const shared = anchorDifference(points, clusters, form, link.a, link.b);
		model.add(form, link.a, link.b, { equal: Number(shared) / Number(unit) });
	}
	addFarGaps(points, forms, clustering, unit, random, model);
	model.minimizeSpan(forms, clustering);

	const solution = solve(model.build(), { includeZeroVariables: true, precision: SOLVER_PRECISION }); // prettier-ignore
	if (solution.status !== 'optimal') return undefined;
	return model.read(solution.variables);
}

/**
 * The links whose equations don't follow from home's pin and the links kept before them. A cycle
 * of links makes its last one redundant, and the solver's elimination can trip over redundant
 * equalities; placement still holds every link exactly. Rank is found modulo {@link RANK_PRIME}.
 */
function independentLinks(
	forms: readonly LineForm[],
	links: Link[],
	home: number,
	clusterCount: number,
): Link[] {
	/** Reduced rows of the kept equations, by pivot variable. */
	const basis = new Map<number, Float64Array>();
	const keepIfIndependent = (row: Float64Array): boolean => {
		for (const [pivot, basisRow] of basis) subtractMultiple(row, basisRow, row[pivot]!);
		const pivot = row.findIndex((v) => v !== 0);
		if (pivot === -1) return false;
		scaleRow(row, modularInverse(row[pivot]!));
		for (const basisRow of basis.values()) subtractMultiple(basisRow, row, basisRow[pivot]!);
		basis.set(pivot, row);
		return true;
	};
	const row = (terms: [variable: number, coefficient: bigint][]): Float64Array => {
		const values = new Float64Array(2 * clusterCount);
		for (const [variable, coefficient] of terms) values[variable] = (Number(coefficient) + RANK_PRIME) % RANK_PRIME; // prettier-ignore
		return values;
	};
	keepIfIndependent(row([[2 * home, 1n]]));
	keepIfIndependent(row([[2 * home + 1, 1n]]));
	return links.filter((link) => {
		const { a, b } = forms[link.form]!;
		return keepIfIndependent(row([[2 * link.a, a], [2 * link.b, -a], [2 * link.a + 1, b], [2 * link.b + 1, -b]])); // prettier-ignore
	});
}

/** `row -= factor · other`, modulo {@link RANK_PRIME}. */
function subtractMultiple(row: Float64Array, other: Float64Array, factor: number): void {
	if (factor === 0) return;
	for (let i = 0; i < row.length; i++) row[i] = (row[i]! - ((factor * other[i]!) % RANK_PRIME) + RANK_PRIME) % RANK_PRIME; // prettier-ignore
}

/** `row *= factor`, modulo {@link RANK_PRIME}. */
function scaleRow(row: Float64Array, factor: number): void {
	for (let i = 0; i < row.length; i++) row[i] = (row[i]! * factor) % RANK_PRIME;
}

/** The inverse of `value` modulo {@link RANK_PRIME}, by the extended Euclidean algorithm. */
function modularInverse(value: number): number {
	let [r0, r1, s0, s1] = [RANK_PRIME, value, 0, 1];
	while (r1 !== 0) {
		const quotient = Math.floor(r0 / r1);
		[r0, r1, s0, s1] = [r1, r0 - quotient * r1, s1, s0 - quotient * s1];
	}
	return (s0 + RANK_PRIME) % RANK_PRIME;
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
 * Requires every far gap between two clusters to stay far: at least one unit plus jitter, or its
 * original size when that's smaller, less {@link MODERATE_GAP_SLACK}, but always beyond the exact span.
 */
function addFarGaps(
	points: readonly CompressionPoint[],
	forms: readonly LineForm[],
	clustering: Clustering,
	unit: bigint,
	random: () => number,
	model: ModelBuilder,
): void {
	const { values, orders, classes, clusterOf, clusters } = clustering;
	orders.forEach((order, f) => {
		/** The tightest bound between each pair of clusters, as several of their points may neighbour. */
		const bounds = new Map<number, { above: number; below: number; minimum: bigint }>();
		for (let k = 1; k < order.length; k++) {
			const [p, q] = [order[k - 1]!, order[k]!];
			const [cp, cq] = [clusterOf[p]!, clusterOf[q]!];
			if (classes[f]![p] === classes[f]![q] || cp === cq) continue;
			const gap = values[f]![q]! - values[f]![p]!;
			const jittered = unit + BigInt(Math.floor(random() * Number(unit)));
			const moderate = bimath.max(
				enginehorizons.EXACT_SPAN + 1n,
				gap - (gap >> MODERATE_GAP_SLACK),
			);
			// Points sit at their cluster's anchor plus a fixed offset, which the bound absorbs.
			const offsets = values[f]![q]! - lineforms.value(forms[f]!, points[clusters[cq]![0]!]!.coords) - (values[f]![p]! - lineforms.value(forms[f]!, points[clusters[cp]![0]!]!.coords)); // prettier-ignore
			const minimum = bimath.min(jittered, moderate) - offsets;
			const pair = cq * clusters.length + cp;
			const existing = bounds.get(pair);
			if (!existing || minimum > existing.minimum)
				bounds.set(pair, { above: cq, below: cp, minimum });
		}
		for (const { above, below, minimum } of bounds.values()) {
			model.add(forms[f]!, above, below, { min: Number(minimum) / Number(unit) });
		}
	});
}

// Model Building --------------------------------------------------------------

/**
 * Accumulates the linear program over each cluster's (x, y): variable `2c` is cluster c's x
 * and `2c + 1` its y. Constraint keys count up from 1; key 0 is the objective. The solver only
 * takes nonnegative variables, so each is offset, which bounds how far below home a cluster goes.
 */
class ModelBuilder {
	private readonly coefficients = new Map<number, Map<number, number>>();
	private readonly constraints = new Map<number, Constraint>();
	private nextKey = 1;

	constructor(
		private readonly clusterCount: number,
		private readonly offset: number,
	) {}

	/** Pins cluster `c` at the origin. */
	fix(c: number): void {
		this.constrain([[2 * c, 1]], { equal: this.offset });
		this.constrain([[2 * c + 1, 1]], { equal: this.offset });
	}

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
	minimizeSpan(forms: readonly LineForm[], clustering: Clustering): void {
		for (const axis of [0, 1] as const) {
			const order = clustering.orders[forms.findIndex((form) => (axis === 0 ? form.b : form.a) === 0n)]!; // prettier-ignore
			this.term(2 * clustering.clusterOf[order.at(-1)!]! + axis, 0, 1);
			this.term(2 * clustering.clusterOf[order[0]!]! + axis, 0, -1);
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

	/** Each cluster's solved position, relative to the pinned home. */
	read(variables: [number, number][]): Layout {
		const layout: Layout = { x: new Float64Array(this.clusterCount), y: new Float64Array(this.clusterCount) }; // prettier-ignore
		for (const [variable, value] of variables) {
			const axis = variable % 2 === 0 ? layout.x : layout.y;
			axis[variable >> 1] = value - this.offset;
		}
		return layout;
	}

	private constrain(terms: [number, number][], bound: Constraint): void {
		const key = this.nextKey++;
		this.constraints.set(key, bound);
		for (const [variable, coefficient] of terms) this.term(variable, key, coefficient);
	}

	private term(variable: number, key: number, coefficient: number): void {
		let row = this.coefficients.get(variable);
		if (!row) this.coefficients.set(variable, (row = new Map()));
		row.set(key, (row.get(key) ?? 0) + coefficient);
	}
}

// Exports ---------------------------------------------------------------------

export default {
	lay,
};
