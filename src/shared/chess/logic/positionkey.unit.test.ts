// src/shared/chess/logic/positionkey.unit.test.ts

/**
 * Pins what a position key counts: the side to move and each piece's type and square, whatever
 * order the board holds them in.
 */

import type { CoordsKey } from '../../util/coordutil.js';

import { describe, it, expect } from 'vitest';

import positionkey from './positionkey.js';
import { rawTypes as r, ext as e, players as p } from '../util/typeutil.js';

/** Pieces as a board organizes them, from `[square, type]` entries, held in the order given. */
function piecesOf(entries: [CoordsKey, number][]): Parameters<typeof positionkey.of>[0] {
	const squares = entries.map(([square], idx): [CoordsKey, number] => [square, idx]);
	const types = entries.map(([, type]) => type);
	return { coords: new Map(squares), types: Uint8Array.from(types) };
}

const PIECES: [CoordsKey, number][] = [['5,1', r.KING + e.W], ['5,8', r.KING + e.B], ['4,1', r.QUEEN + e.W]]; // prettier-ignore

describe('positionkey.of', () => {
	it('keys the same pieces alike whatever order the board holds them in', () => {
		const key = positionkey.of(piecesOf(PIECES), p.WHITE);
		expect(positionkey.of(piecesOf([...PIECES].reverse()), p.WHITE)).toBe(key);
		expect(key).toMatch(positionkey.PATTERN);
	});

	it('tells apart the side to move, a moved piece, and a changed type', () => {
		const key = positionkey.of(piecesOf(PIECES), p.WHITE);
		expect(positionkey.of(piecesOf(PIECES), p.BLACK)).not.toBe(key);
		expect(positionkey.of(piecesOf([['5,2', r.KING + e.W], ...PIECES.slice(1)]), p.WHITE)).not.toBe(key); // prettier-ignore
		expect(positionkey.of(piecesOf([['5,1', r.AMAZON + e.W], ...PIECES.slice(1)]), p.WHITE)).not.toBe(key); // prettier-ignore
	});
});
