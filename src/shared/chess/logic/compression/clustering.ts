// src/shared/chess/logic/compression/clustering.ts

/**
 * Groups a position's points by what compression must keep exact. Under each line form, points
 * whose values chain together within the exact span form a class, which only moves as one.
 * Points sharing classes in two forms can't move apart at all, so they weld into rigid clusters;
 * clusters sharing a class in one form are linked, free only to slide along it.
 */

import type { Coords } from '../../../util/coordutil.js';
import type { LineForm } from './lineforms.js';

import bimath from '../../../util/math/bimath.js';

import lineforms from './lineforms.js';

// Types -----------------------------------------------------------------------

/** A square or line whose relations compression keeps. */
export interface CompressionPoint {
	coords: Coords;
	/**
	 * Present for a lone line (a promotion rank or border edge) rather than a square: it takes part
	 * only in its own form, and its other coordinate means nothing.
	 */
	line?: { form: number };
}

/** Two clusters held to one class of a form: their translations agree under it. */
export interface Link {
	form: number;
	a: number;
	b: number;
}

/** How a position's points relate under each form. */
export interface Clustering {
	/** Per form, each point's value, or undefined where the point takes no part. */
	values: (bigint | undefined)[][];
	/** Per form, the taking-part points in ascending value. */
	orders: number[][];
	/** Per form, each taking-part point's class (-1 where it takes no part). */
	classes: Int32Array[];
	/** Each point's rigid cluster. */
	clusterOf: Int32Array;
	/** Each cluster's points, its anchor first. */
	clusters: number[][];
	links: Link[];
}

// Functions -------------------------------------------------------------------

/** Clusters `points` under `forms`, so that every gap within `span` stays exact. */
function build(
	points: readonly CompressionPoint[],
	forms: readonly LineForm[],
	span: bigint,
): Clustering {
	const values = forms.map((form, f) =>
		points.map((point) =>
			point.line === undefined || point.line.form === f
				? lineforms.value(form, point.coords)
				: undefined,
		),
	);
	const orders = values.map((formValues) => sortByValue(formValues));
	const classes = orders.map((order, f) => classify(order, values[f]!, points.length, span));
	const clusterOf = weldClusters(points.length, orders, classes);
	const clusters = groupClusters(clusterOf);
	return {
		values,
		orders,
		classes,
		clusterOf,
		clusters,
		links: findLinks(orders, classes, clusterOf),
	};
}

/** The indices of the defined values, in ascending value. */
function sortByValue(formValues: (bigint | undefined)[]): number[] {
	const order: number[] = [];
	formValues.forEach((value, i) => {
		if (value !== undefined) order.push(i);
	});
	return order.sort((i, j) => bimath.compare(formValues[i]!, formValues[j]!));
}

/** Numbers the classes along one form's order: a gap beyond `span` starts the next. */
function classify(
	order: number[],
	formValues: (bigint | undefined)[],
	pointCount: number,
	span: bigint,
): Int32Array {
	const classOf = new Int32Array(pointCount).fill(-1);
	let current = -1;
	let previous: bigint | undefined;
	for (const i of order) {
		const value = formValues[i]!;
		if (previous === undefined || value - previous > span) current++;
		classOf[i] = current;
		previous = value;
	}
	return classOf;
}

/**
 * Each point's rigid cluster: the closure of merging any two clusters that share
 * classes in two forms, since their translations must then agree in both coordinates.
 */
function weldClusters(pointCount: number, orders: number[][], classes: Int32Array[]): Int32Array {
	const parent = Int32Array.from({ length: pointCount }, (_, i) => i);
	const find = (i: number): number => {
		while (parent[i] !== i) i = parent[i] = parent[parent[i]!]!;
		return i;
	};
	// Points sharing two classes with each other weld at once, leaving few roots per class below.
	for (let f = 0; f < classes.length; f++) {
		for (let g = f + 1; g < classes.length; g++) {
			const first = new Map<number, number>();
			for (let i = 0; i < pointCount; i++) {
				const [cf, cg] = [classes[f]![i]!, classes[g]![i]!];
				if (cf === -1 || cg === -1) continue;
				const key = cf * pointCount + cg;
				const other = first.get(key);
				if (other === undefined) first.set(key, i);
				else parent[find(i)] = find(other);
			}
		}
	}
	for (let merged = true; merged; ) {
		merged = false;
		/** For each pair of cluster roots sharing a class, a bit per form they share one in. */
		const sharedForms = new Map<number, number>();
		orders.forEach((order, f) => {
			for (const roots of groupRootsByClass(order, classes[f]!, find)) {
				for (let i = 0; i < roots.length; i++) {
					for (let j = i + 1; j < roots.length; j++) {
						const pair = Math.min(roots[i]!, roots[j]!) * pointCount + Math.max(roots[i]!, roots[j]!); // prettier-ignore
						sharedForms.set(pair, (sharedForms.get(pair) ?? 0) | (1 << f));
					}
				}
			}
		});
		for (const [pair, formBits] of sharedForms) {
			if ((formBits & (formBits - 1)) === 0) continue; // Shares only one form: a link, not a weld.
			const [a, b] = [find(Math.floor(pair / pointCount)), find(pair % pointCount)];
			if (a === b) continue;
			parent[a] = b;
			merged = true;
		}
	}
	return Int32Array.from({ length: pointCount }, (_, i) => find(i));
}

/** The distinct cluster roots within each class of one form, in order. */
function groupRootsByClass(
	order: number[],
	classOf: Int32Array,
	find: (i: number) => number,
): number[][] {
	const groups: number[][] = [];
	for (const i of order) {
		if (groups.length <= classOf[i]!) groups.push([]);
		const roots = groups[classOf[i]!]!;
		const root = find(i);
		if (!roots.includes(root)) roots.push(root);
	}
	return groups;
}

/**
 * Renumbers the cluster roots 0…n and lists each cluster's points, rewriting `clusterOf` in place.
 */
function groupClusters(clusterOf: Int32Array): number[][] {
	const idOfRoot = new Map<number, number>();
	const clusters: number[][] = [];
	clusterOf.forEach((root, i) => {
		let id = idOfRoot.get(root);
		if (id === undefined) {
			id = clusters.length;
			idOfRoot.set(root, id);
			clusters.push([]);
		}
		clusters[id]!.push(i);
		clusterOf[i] = id;
	});
	return clusters;
}

/** Chains together the distinct clusters within each class of each form. */
function findLinks(orders: number[][], classes: Int32Array[], clusterOf: Int32Array): Link[] {
	const links: Link[] = [];
	orders.forEach((order, form) => {
		for (const members of groupRootsByClass(order, classes[form]!, (i) => clusterOf[i]!)) {
			for (let i = 1; i < members.length; i++) {
				links.push({ form, a: members[i - 1]!, b: members[i]! });
			}
		}
	});
	return links;
}

/**
 * Whether `point`'s coordinate on `axis` (0 = x) means anything: always for a square, only its own
 * for a lone line.
 */
function usesAxis(forms: readonly LineForm[], point: CompressionPoint, axis: 0 | 1): boolean {
	if (point.line === undefined) return true;
	const form = forms[point.line.form]!;
	return (axis === 0 ? form.a : form.b) !== 0n;
}

// Exports ---------------------------------------------------------------------

export default {
	build,
	usesAxis,
};
