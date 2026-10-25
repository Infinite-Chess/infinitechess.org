// scripts/cheatdetection/lib/logistic.ts

/**
 * Plain logistic regression, fitted by Newton's method (IRLS) with a little ridge for stability:
 * what every probability model of the research is.
 */

import bettingScore from '../../../src/server/game/cheatdetection/bettingScore.js';

// Functions -------------------------------------------------------------------

/** The weights maximising the likelihood of outcomes `y` (0 or 1) given inputs `X`. */
function fit(X: number[][], y: number[], ridge = 1e-3, iterations = 30): number[] {
	const d = X[0]!.length;
	let w: number[] = new Array(d).fill(0);
	for (let it = 0; it < iterations; it++) {
		const hessian: number[][] = Array.from({ length: d }, () => new Array(d).fill(0));
		const gradient: number[] = new Array(d).fill(0);
		X.forEach((x, i) => {
			const p = bettingScore.logistic(w, x);
			const residual = y[i]! - p;
			const curvature = p * (1 - p);
			for (let a = 0; a < d; a++) {
				gradient[a]! += residual * x[a]!;
				for (let b = 0; b < d; b++) hessian[a]![b]! += curvature * x[a]! * x[b]!;
			}
		});
		for (let a = 0; a < d; a++) {
			hessian[a]![a]! += ridge * X.length;
			gradient[a]! -= ridge * X.length * w[a]!;
		}
		const step = solve(hessian, gradient);
		w = w.map((v, i) => v + step[i]!);
		if (Math.max(...step.map((s) => Math.abs(s))) < 1e-8) break;
	}
	return w;
}

/** Solves `A x = b` by Gauss-Jordan elimination with partial pivoting. */
function solve(A: number[][], b: number[]): number[] {
	const n = b.length;
	const M = A.map((row, i) => [...row, b[i]!]);
	for (let c = 0; c < n; c++) {
		let pivot = c;
		for (let r = c + 1; r < n; r++)
			if (Math.abs(M[r]![c]!) > Math.abs(M[pivot]![c]!)) pivot = r;
		[M[c], M[pivot]] = [M[pivot]!, M[c]!];
		for (let r = 0; r < n; r++) {
			if (r === c) continue;
			const factor = M[r]![c]! / M[c]![c]!;
			for (let k = c; k <= n; k++) M[r]![k]! -= factor * M[c]![k]!;
		}
	}
	return M.map((row, i) => row[n]! / row[i]!);
}

// Exports ---------------------------------------------------------------------

export default {
	fit,
};
