// src/client/scripts/esm/views/analysis/compression/placement.ts

/**
 * Turns a cluster layout into exact compressed coordinates. The layout is approximate, so each
 * linked cluster is placed exactly on its parent's line along a spanning tree, every translation
 * kept a multiple of the residue modulus. A link closing a cycle is then repaired by sliding
 * whole subtrees along their tree links, solved as a small integer system.
 */

import type { Layout } from './skeleton.js';
import type { Coords } from '../../../../../../shared/util/coordutil.js';
import type { LineForm } from './lineforms.js';
import type { Clustering, CompressionPoint, Link } from './clustering.js';

import bimath from '../../../../../../shared/util/math/bimath.js';

import lineforms from './lineforms.js';

// Types -----------------------------------------------------------------------

/** A tree link, from the cluster placed first to the one placed along it. */
interface TreeEdge {
	form: number;
	parent: number;
	child: number;
}

// Constants -------------------------------------------------------------------

/** The home cluster keeps its own coordinates within this reach of the origin; beyond, it's moved near it. */
const HOME_REACH = 2n ** 40n;

// Functions -------------------------------------------------------------------

/** Every point's compressed coordinates, or undefined if a link cycle can't be closed exactly. */
function place(
	points: readonly CompressionPoint[],
	forms: readonly LineForm[],
	clustering: Clustering,
	layout: Layout,
	home: number,
	unit: bigint,
	modulus: bigint,
): Coords[] | undefined {
	const anchors = clustering.clusters.map((members) => points[members[0]!]!.coords);
	const homeAnchor = anchors[home]!;
	const homeAt: Coords = homeAnchor.every((v) => bimath.abs(v) <= HOME_REACH)
		? homeAnchor
		: nearestCongruent([0n, 0n], homeAnchor, modulus);
	const targets = anchors.map(
		(_, c): Coords => [
			homeAt[0] + BigInt(Math.round(layout.x[c]! * Number(unit))),
			homeAt[1] + BigInt(Math.round(layout.y[c]! * Number(unit))),
		],
	);

	const { placed, tree, closures } = placeAlongTree(forms, clustering, anchors, targets, home, homeAt, modulus); // prettier-ignore
	if (!closeCycles(forms, anchors, placed, tree, closures, modulus)) return undefined;

	return points.map((point, i) => {
		const c = clustering.clusterOf[i]!;
		const [anchor, at] = [anchors[c]!, placed[c]!];
		return [at[0] + point.coords[0] - anchor[0], at[1] + point.coords[1] - anchor[1]];
	});
}

/**
 * Places home, then every cluster reachable along links breadth-first, each exactly on its parent's
 * line at the spot nearest its target. A cluster no link reaches roots a tree of its own.
 */
function placeAlongTree(
	forms: readonly LineForm[],
	clustering: Clustering,
	anchors: Coords[],
	targets: Coords[],
	home: number,
	homeAt: Coords,
	modulus: bigint,
): { placed: Coords[]; tree: TreeEdge[]; closures: Link[] } {
	const adjacency: Link[][] = anchors.map(() => []);
	for (const link of clustering.links) {
		adjacency[link.a]!.push(link);
		adjacency[link.b]!.push(link);
	}
	const placed: (Coords | undefined)[] = anchors.map(() => undefined);
	const tree: TreeEdge[] = [];
	const usedLinks = new Set<Link>();

	const roots = [home, ...anchors.keys()];
	for (const root of roots) {
		if (placed[root]) continue;
		placed[root] =
			root === home ? homeAt : nearestCongruent(targets[root]!, anchors[root]!, modulus);
		for (const queue = [root]; queue.length > 0; ) {
			const parent = queue.shift()!;
			for (const link of adjacency[parent]!) {
				const child = link.a === parent ? link.b : link.a;
				if (placed[child]) continue;
				usedLinks.add(link);
				tree.push({ form: link.form, parent, child });
				const form = forms[link.form]!;
				const line = lineforms.value(form, placed[parent]!) + lineforms.value(form, anchors[child]!) - lineforms.value(form, anchors[parent]!); // prettier-ignore
				placed[child] = nearestOnLine(
					form,
					line,
					targets[child]!,
					anchors[child]!,
					modulus,
				);
				queue.push(child);
			}
		}
	}
	const closures = clustering.links.filter((link) => !usedLinks.has(link));
	return { placed: placed as Coords[], tree, closures };
}

/**
 * Makes every link outside the tree hold exactly, by sliding subtrees along their tree links in
 * multiples of the modulus. Returns false when the integer system has no solution.
 */
function closeCycles(
	forms: readonly LineForm[],
	anchors: Coords[],
	placed: Coords[],
	tree: TreeEdge[],
	closures: Link[],
	modulus: bigint,
): boolean {
	if (closures.length === 0) return true;
	const paths = treePaths(anchors.length, tree);
	const residuals = closures.map((link) =>
		linkResidual(forms[link.form]!, anchors, placed, link),
	);
	if (residuals.every((r) => r === 0n)) return true;
	if (residuals.some((r) => r % modulus !== 0n)) return false;

	const matrix = closures.map((link) =>
		tree.map((edge, e) => {
			const along = lineforms.value(
				forms[link.form]!,
				lineforms.direction(forms[edge.form]!),
			);
			return along * (BigInt(paths[link.a]!.has(e)) - BigInt(paths[link.b]!.has(e)));
		}),
	);
	const slides = solveIntegerSystem(
		matrix,
		residuals.map((r) => -r / modulus),
	);
	if (!slides) return false;

	slides.forEach((slide, e) => {
		if (slide === 0n) return;
		const [dx, dy] = lineforms.direction(forms[tree[e]!.form]!);
		paths.forEach((path, c) => {
			if (path.has(e)) placed[c] = [placed[c]![0] + slide * modulus * dx, placed[c]![1] + slide * modulus * dy]; // prettier-ignore
		});
	});
	return closures.every((link) => linkResidual(forms[link.form]!, anchors, placed, link) === 0n);
}

/** Each cluster's tree edges on its way up to its root. */
function treePaths(clusterCount: number, tree: TreeEdge[]): Set<number>[] {
	const edgeInto = new Map(tree.map((edge, e) => [edge.child, e]));
	return Array.from({ length: clusterCount }, (_, c) => {
		const path = new Set<number>();
		for (let e = edgeInto.get(c); e !== undefined; e = edgeInto.get(tree[e]!.parent))
			path.add(e);
		return path;
	});
}

/** How far a link's placed clusters are from holding their original difference under its form. */
function linkResidual(form: LineForm, anchors: Coords[], placed: Coords[], link: Link): bigint {
	const placedDifference = lineforms.value(form, placed[link.a]!) - lineforms.value(form, placed[link.b]!); // prettier-ignore
	return placedDifference - (lineforms.value(form, anchors[link.a]!) - lineforms.value(form, anchors[link.b]!)); // prettier-ignore
}

/**
 * Solves `matrix · x = rhs` over the integers, or undefined when no integer solution exists. The
 * matrix is brought to column echelon form `matrix · U`, with `U` unimodular; the triangular system
 * then solves by forward substitution, and `x = U · y`.
 */
function solveIntegerSystem(matrix: bigint[][], rhs: bigint[]): bigint[] | undefined {
	const { echelon, unimodular, pivots, rank } = columnEchelon(matrix);
	const y = forwardSubstitute(echelon, pivots, rank, rhs);
	if (!y) return undefined;
	// The unimodular columns past the pivots span every solution's freedom.
	const freedoms = Array.from({ length: unimodular.length - rank }, (_, k) => unimodular.map((row) => row[rank + k]!)); // prettier-ignore
	return shrink(
		unimodular.map((row) => dot(row, y)),
		freedoms,
	);
}

/** `matrix · U` in column echelon form by Euclid's algorithm on columns, and each row's pivot column. */
function columnEchelon(matrix: bigint[][]): {
	echelon: bigint[][];
	unimodular: bigint[][];
	pivots: (number | undefined)[];
	rank: number;
} {
	const echelon = matrix.map((row) => [...row]);
	const columnCount = matrix[0]!.length;
	const unimodular = Array.from({ length: columnCount }, (_, i) => Array.from({ length: columnCount }, (_, j) => BigInt(i === j))); // prettier-ignore
	const columnOp = (target: number, source: number, factor: bigint): void => {
		for (const row of [...echelon, ...unimodular]) row[target]! -= factor * row[source]!;
	};
	const swapColumns = (a: number, b: number): void => {
		for (const row of [...echelon, ...unimodular]) [row[a], row[b]] = [row[b]!, row[a]!];
	};

	const pivots: (number | undefined)[] = [];
	let rank = 0;
	for (const row of echelon) {
		for (;;) {
			let smallest = -1;
			for (let c = rank; c < columnCount; c++) {
				if (row[c] !== 0n && (smallest === -1 || bimath.abs(row[c]!) < bimath.abs(row[smallest]!))) smallest = c; // prettier-ignore
			}
			if (smallest === -1) break;
			swapColumns(rank, smallest);
			let cleared = true;
			for (let c = rank + 1; c < columnCount; c++) {
				if (row[c] === 0n) continue;
				columnOp(c, rank, row[c]! / row[rank]!);
				if (row[c] !== 0n) cleared = false;
			}
			if (cleared) break;
		}
		pivots.push(row[rank] === undefined || row[rank] === 0n ? undefined : rank++);
	}
	return { echelon, unimodular, pivots, rank };
}

/** The `y` solving the echelon system, or undefined when some row can't hold over the integers. */
function forwardSubstitute(
	echelon: bigint[][],
	pivots: (number | undefined)[],
	rank: number,
	rhs: bigint[],
): bigint[] | undefined {
	const y: bigint[] = new Array(echelon[0]!.length).fill(0n);
	for (let r = 0; r < echelon.length; r++) {
		const pivot = pivots[r];
		let remainder = rhs[r]!;
		for (let c = 0; c < (pivot ?? rank); c++) remainder -= echelon[r]![c]! * y[c]!;
		if (pivot === undefined) {
			if (remainder !== 0n) return undefined;
		} else {
			if (remainder % echelon[r]![pivot]! !== 0n) return undefined;
			y[pivot] = remainder / echelon[r]![pivot]!;
		}
	}
	return y;
}

/** Moves `solution` along `freedoms` until no step shrinks it, as Euclid's steps can leave it huge. */
function shrink(solution: bigint[], freedoms: bigint[][]): bigint[] {
	for (let shrunk = true; shrunk; ) {
		shrunk = false;
		for (const freedom of freedoms) {
			const steps = nearestQuotient(dot(solution, freedom), dot(freedom, freedom));
			if (steps === 0n) continue;
			solution.forEach((value, i) => (solution[i] = value - steps * freedom[i]!));
			shrunk = true;
		}
	}
	return solution;
}

/** The dot product of two equal-length vectors. */
function dot(a: bigint[], b: bigint[]): bigint {
	return a.reduce((sum, value, i) => sum + value * b[i]!, 0n);
}

/** The integer nearest `numerator / denominator`, for a positive denominator. */
function nearestQuotient(numerator: bigint, denominator: bigint): bigint {
	const doubled = 2n * numerator + denominator;
	const quotient = doubled / (2n * denominator);
	return doubled < 0n && quotient * 2n * denominator !== doubled ? quotient - 1n : quotient;
}

/** The value congruent to `like` modulo `modulus` nearest `target`, per coordinate. */
function nearestCongruent(target: Coords, like: Coords, modulus: bigint): Coords {
	return [nearestCongruentValue(target[0], like[0], modulus), nearestCongruentValue(target[1], like[1], modulus)]; // prettier-ignore
}

/** The value congruent to `like` modulo `modulus` nearest `target`. */
function nearestCongruentValue(target: bigint, like: bigint, modulus: bigint): bigint {
	const below = target - bimath.posMod(target - like, modulus);
	return target - below <= below + modulus - target ? below : below + modulus;
}

/**
 * The square on line `line` of `form`, congruent to `like`, nearest `target` along the line.
 * Every form has a unit coefficient, so its other coordinate is free and the division exact.
 */
function nearestOnLine(
	form: LineForm,
	line: bigint,
	target: Coords,
	like: Coords,
	modulus: bigint,
): Coords {
	if (bimath.abs(form.b) === 1n) {
		const x = nearestCongruentValue(target[0], like[0], modulus);
		return [x, (line - form.a * x) * form.b];
	}
	const y = nearestCongruentValue(target[1], like[1], modulus);
	return [(line - form.b * y) * form.a, y];
}

// Exports ---------------------------------------------------------------------

export default {
	place,
};
