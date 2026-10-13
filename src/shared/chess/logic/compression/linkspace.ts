// src/shared/chess/logic/compression/linkspace.ts

/**
 * The linear equations a position's links impose on its clusters' translations, kept as a reduced
 * basis modulo a prime, so that any other linear sum can be told to be fixed by them already.
 * Variable `2c` is cluster c's x translation, `2c + 1` its y.
 */

import type { LineForm } from './lineforms.js';
import type { Separation } from './skeleton.js';
import type { Clustering, Link } from './clustering.js';

// Types -----------------------------------------------------------------------

/** A linear sum over the clusters' translations, as [variable, coefficient] pairs. */
type LinearSum = [variable: number, coefficient: bigint][];

/** A reduced basis of equations, by pivot variable. */
type Basis = Map<number, Float64Array>;

// Constants -------------------------------------------------------------------

/** A prime below 2^26, so a product of two residues stays exact in a double. */
const PRIME = 67108859;

// Functions -------------------------------------------------------------------

/** An empty basis. */
function create(): Basis {
	return new Map();
}

/** Adds the equation fixing `sum` to the basis, returning false if the basis already fixed it. */
function add(basis: Basis, clusterCount: number, sum: LinearSum): boolean {
	const row = reduce(basis, toRow(clusterCount, sum));
	const pivot = row.findIndex((v) => v !== 0);
	if (pivot === -1) return false;
	scaleRow(row, modularInverse(row[pivot]!));
	for (const basisRow of basis.values()) subtractMultiple(basisRow, row, basisRow[pivot]!);
	basis.set(pivot, row);
	return true;
}

/** Whether the basis already fixes `sum`. */
function fixes(basis: Basis, clusterCount: number, sum: LinearSum): boolean {
	const row = toRow(clusterCount, sum);
	return row.every((v) => v === 0) || reduce(basis, row).every((v) => v === 0);
}

/**
 * Whether the links already fix a separation's sum. Most sums repeat, or cancel within one rigid
 * cluster under one form, so those are answered without the basis.
 */
function fixer(
	forms: readonly LineForm[],
	structure: Clustering,
): (separation: Separation) => boolean {
	const { links, clusters, clusterOf } = structure;
	const basis = create();
	for (const link of links) add(basis, clusters.length, linkSum(forms, link));
	const answers = new Map<string, boolean>();
	return (separation) => {
		const byClusterForm = new Map<number, bigint>();
		for (const [point, form, coefficient] of separation.terms) {
			const key = clusterOf[point]! * forms.length + form;
			byClusterForm.set(key, (byClusterForm.get(key) ?? 0n) + coefficient);
		}
		if ([...byClusterForm.values()].every((coefficient) => coefficient === 0n)) return true;
		const sum = separationSum(forms, clusterOf, separation);
		const key = combine(sum).join(';');
		let answer = answers.get(key);
		if (answer === undefined) answers.set(key, (answer = key === '' || fixes(basis, clusters.length, sum))); // prettier-ignore
		return answer;
	};
}

/** The sum a link holds fixed: its form's value of one cluster's translation less the other's. */
function linkSum(forms: readonly LineForm[], link: Link): LinearSum {
	const { a, b } = forms[link.form]!;
	return [[2 * link.a, a], [2 * link.b, -a], [2 * link.a + 1, b], [2 * link.b + 1, -b]]; // prettier-ignore
}

/** A sum's terms combined by variable, without zeros, in variable order. */
function combine(sum: LinearSum): LinearSum {
	const coefficients = new Map<number, bigint>();
	for (const [variable, coefficient] of sum) coefficients.set(variable, (coefficients.get(variable) ?? 0n) + coefficient); // prettier-ignore
	return [...coefficients]
		.filter(([, coefficient]) => coefficient !== 0n)
		.sort(([a], [b]) => a - b);
}

/** How a separation's sum moves with its points' clusters' translations. */
function separationSum(
	forms: readonly LineForm[],
	clusterOf: Int32Array,
	separation: Separation,
): LinearSum {
	return separation.terms.flatMap(([point, form, coefficient]): LinearSum => {
		const c = clusterOf[point]!;
		return [[2 * c, coefficient * forms[form]!.a], [2 * c + 1, coefficient * forms[form]!.b]]; // prettier-ignore
	});
}

/** The sum as a dense row of residues. */
function toRow(clusterCount: number, sum: LinearSum): Float64Array {
	const row = new Float64Array(2 * clusterCount);
	for (const [variable, coefficient] of sum) {
		row[variable] = (row[variable]! + Number(((coefficient % BigInt(PRIME)) + BigInt(PRIME)) % BigInt(PRIME))) % PRIME; // prettier-ignore
	}
	return row;
}

/** The row with every basis pivot eliminated. */
function reduce(basis: Basis, row: Float64Array): Float64Array {
	for (const [pivot, basisRow] of basis) subtractMultiple(row, basisRow, row[pivot]!);
	return row;
}

/** `row -= factor · other`, modulo {@link PRIME}. */
function subtractMultiple(row: Float64Array, other: Float64Array, factor: number): void {
	if (factor === 0) return;
	for (let i = 0; i < row.length; i++) row[i] = (row[i]! - ((factor * other[i]!) % PRIME) + PRIME) % PRIME; // prettier-ignore
}

/** `row *= factor`, modulo {@link PRIME}. */
function scaleRow(row: Float64Array, factor: number): void {
	for (let i = 0; i < row.length; i++) row[i] = (row[i]! * factor) % PRIME;
}

/** The inverse of `value` modulo {@link PRIME}, by the extended Euclidean algorithm. */
function modularInverse(value: number): number {
	let [r0, r1, s0, s1] = [PRIME, value, 0, 1];
	while (r1 !== 0) {
		const quotient = Math.floor(r0 / r1);
		[r0, r1, s0, s1] = [r1, r0 - quotient * r1, s1, s0 - quotient * s1];
	}
	return (s0 + PRIME) % PRIME;
}

// Exports ---------------------------------------------------------------------

export default {
	create,
	add,
	fixer,
	linkSum,
	combine,
	separationSum,
};
