// src/shared/chess/logic/compression/lineforms.ts

/**
 * Line families as linear forms: the form (a, b) holds every line `a·x + b·y = c`. Two squares
 * share a line when their values under its form match, and order along it by any other form,
 * so a position's line geometry is fully described by its squares' values under each form.
 */

import type { Vec2 } from '../../../util/math/vectors.js';
import type { Coords } from '../../../util/coordutil.js';

import bimath from '../../../util/math/bimath.js';

// Types -----------------------------------------------------------------------

/** The line family `a·x + b·y = c`, with `a` and `b` coprime and the first nonzero one positive. */
export interface LineForm {
	a: bigint;
	b: bigint;
}

// Functions -------------------------------------------------------------------

/** The family of lines running along `vector`. */
function fromVector([vx, vy]: Vec2): LineForm {
	const gcd = bimath.GCD(vx, vy);
	const [a, b] = [vy / gcd, -vx / gcd];
	return a > 0n || (a === 0n && b > 0n) ? { a, b } : { a: -a, b: -b };
}

/** Which line of `form` holds `coords`. */
function value(form: LineForm, [x, y]: Coords): bigint {
	return form.a * x + form.b * y;
}

/** The primitive step along `form`'s lines, first nonzero component positive. */
function direction(form: LineForm): Coords {
	return form.b < 0n || (form.b === 0n && form.a > 0n) ? [-form.b, form.a] : [form.b, -form.a];
}

/** Zero exactly when the two families are parallel. */
function determinant(f: LineForm, g: LineForm): bigint {
	return f.a * g.b - g.a * f.b;
}

/**
 * The modulus every translation must be a multiple of so that, among `forms`, the same lines still
 * cross on whole squares, and every square keeps its residue mod `grid` too. Two lines cross at
 * their values' combination over the families' determinant, which divides a translation's residue
 * by it, so each determinant multiplies in on top of the grid.
 */
function residueModulus(forms: readonly LineForm[], grid: bigint): bigint {
	let determinants = 1n;
	for (let i = 0; i < forms.length; i++) {
		for (let j = i + 1; j < forms.length; j++) {
			const det = bimath.abs(determinant(forms[i]!, forms[j]!));
			determinants = (determinants * det) / bimath.GCD(determinants, det);
		}
	}
	return grid * determinants;
}

// Exports ---------------------------------------------------------------------

export default {
	fromVector,
	value,
	direction,
	determinant,
	residueModulus,
};
