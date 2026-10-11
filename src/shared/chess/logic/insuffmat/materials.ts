// src/shared/chess/logic/insuffmat/materials.ts

/**
 * Whether a material, a collection of pieces, can ever be arranged into a checkmate: decided by the
 * generated table of smallest mating sets in matingsets.ts (how it was generated, what is proven,
 * and its known holes: scripts/insuffmat/README.md), plus a list of proven draws above its cap.
 */

import type { Coords } from '../../../util/coordutil.js';

import bimath from '../../../util/math/bimath.js';
import matingsets from './matingsets.js';
import icnposition from '../icn/icnposition.js';
import { rawTypes as r } from '../../util/typeutil.js';
import typeutil, { RawType } from '../../util/typeutil.js';

// Types -----------------------------------------------------------------------

/** Which table applies: bounded when the world border is close enough to assist checkmate. */
export type BoardKind = 'unbounded' | 'bounded';

/**
 * A collection of pieces, counted by code: the piece's ICN abbreviation (uppercase white,
 * lowercase black), with colorbound pieces suffixed by their square color, 0 or 1.
 */
export type Material = Map<string, number>;

// Constants -------------------------------------------------------------------

/** The pieces that only ever reach one square color, coded with that color appended. */
const COLORBOUND_RAW_TYPES: RawType[] = [r.BISHOP, r.CAMEL];

/**
 * Every piece code, in the order materials are ranked by. Royals come last, so the sets holding one,
 * the only sets listed, rank together above the rest. Reordering it requires regenerating matingsets.ts.
 */
const RANKED_CODES = 'ro hu nr ce ze gi ca1 ca0 gu ar ch ha am p n b1 b0 r q RO HU NR CE ZE GI CA1 CA0 GU AR CH HA AM P N B1 B0 R Q rq rc k RQ RC K'.split(' '); // prettier-ignore

/** The base-32 digits of matingsets.ts: a number's last digit is one of the first 32, its others of the last 32. */
const RANK_DIGITS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-_';

/** The smallest mating piece sets of each board kind, by canonical rank. */
const MATING_SETS: Record<BoardKind, Set<number>> = {
	unbounded: decodeRanks(matingsets.unbounded),
	bounded: decodeRanks(matingsets.bounded),
};

/**
 * Proven draws with more pieces than the table's cap, each as the most of each piece it allows
 * (Infinity = any number). Black is the side to be mated. Each holds in either color orientation.
 * An entry allowing pawns would let insufficientmaterial.detect() enumerate promotions past the cap,
 * needing a bound again.
 */
const PROVEN_DRAWS: Record<BoardKind, readonly Record<string, number>[]> = {
	unbounded: [
		// For the practice checkmate 1K2N6B-1k losing a knight. Bishops on the king's color never attack its 4
		// orthogonal neighbors, of which the white king covers at most 1 and the knight 2. Bishops on the other
		// color never check, so the knight must, covering at most 1 of the 4 diagonal neighbors to the king's 2.
		{ K: 1, B0: Infinity, N: 1, k: 1 },
	],
	bounded: [],
};

// Codes -----------------------------------------------------------------------

/** A piece's code: its ICN abbreviation, with a colorbound piece's square color appended. */
function getCode(type: number, coords: Coords): string {
	const abbr = icnposition.getAbbrFromType(type);
	if (!COLORBOUND_RAW_TYPES.includes(typeutil.getRawType(type))) return abbr;
	return abbr + String(bimath.abs(coords[0] + coords[1]) % 2n);
}

// Lookup ----------------------------------------------------------------------

/** Whether the material can never be arranged into a checkmate, on the given board kind. */
function isInsufficient(material: Material, boardKind: BoardKind): boolean {
	if (PROVEN_DRAWS[boardKind].some((draw) => doesMaterialFitDraw(material, draw))) return true;
	let pieceCount = 0;
	for (const count of material.values()) pieceCount += count;
	if (pieceCount > matingsets.cap[boardKind]) return false; // Beyond the table: never declared a draw
	return !doesContainMatingSet(material, MATING_SETS[boardKind]);
}

/** Whether every piece of the material fits within the proven draw, in some orientation. */
function doesMaterialFitDraw(material: Material, draw: Record<string, number>): boolean {
	return getOrientations(material).some((variant) =>
		[...variant].every(([code, count]) => count <= (draw[code] ?? 0)),
	);
}

/** Whether some collection of the material's pieces is a listed smallest mating set. */
function doesContainMatingSet(material: Material, matingSets: Set<number>): boolean {
	const codes = [...material.keys()];
	const subset: Material = new Map();
	/** Tries every count of each code from the index on, testing each finished subset. */
	const tryFrom = (index: number): boolean => {
		if (index === codes.length)
			return subset.size > 0 && matingSets.has(getCanonicalRank(subset));
		const code = codes[index]!;
		for (let count = 0; count <= material.get(code)!; count++) {
			if (count === 0) subset.delete(code);
			else subset.set(code, count);
			if (tryFrom(index + 1)) return true;
		}
		subset.delete(code);
		return false;
	};
	return tryFrom(0);
}

// Ranking ---------------------------------------------------------------------

/**
 * One rank shared by a material and its mirror images, which can all mate equally: the smallest
 * of their ranks. matingsets.ts lists the smallest mating sets by it.
 */
function getCanonicalRank(material: Material): number {
	return Math.min(...getOrientations(material).map((variant) => rank(variant)));
}

/** The material and its mirror images: colors swapped, square colors swapped, and both. */
function getOrientations(material: Material): Material[] {
	const swapColors = (code: string): string => (code === code.toUpperCase() ? code.toLowerCase() : code.toUpperCase()); // prettier-ignore
	const swapSquareColors = (code: string): string => code.replace(/[01]$/, (color) => (color === '0' ? '1' : '0')); // prettier-ignore
	const remap = (swap: (code: string) => string): Material => new Map([...material].map(([code, count]) => [swap(code), count])); // prettier-ignore
	return [
		material,
		remap(swapColors),
		remap(swapSquareColors),
		remap((code) => swapSquareColors(swapColors(code))),
	];
}

/** The material's colex rank over RANKED_CODES: distinct per material, fewer pieces ranking lower. */
function rank(material: Material): number {
	const values: number[] = [];
	for (const [code, count] of material) {
		const value = RANKED_CODES.indexOf(code);
		if (value === -1) return -1; // A piece missing from RANKED_CODES, which writetable.ts refuses
		for (let i = 0; i < count; i++) values.push(value);
	}
	values.sort((a, b) => a - b);
	let result = binomial(RANKED_CODES.length - 1 + values.length, values.length - 1); // Materials of fewer pieces
	values.forEach((value, i) => (result += binomial(value + i, i + 1)));
	return result;
}

/** n choose k. */
function binomial(n: number, k: number): number {
	let result = 1;
	for (let i = 0; i < k; i++) result = (result * (n - i)) / (i + 1);
	return result;
}

/** One table of matingsets.ts as its ranks: the gaps between them, sorted, as base-32 RANK_DIGITS. */
function decodeRanks(text: string): Set<number> {
	const ranks = new Set<number>();
	let rank = 0;
	let gap = 0;
	for (const char of text) {
		const digit = RANK_DIGITS.indexOf(char);
		gap = gap * 32 + (digit % 32);
		if (digit >= 32) continue;
		ranks.add((rank += gap));
		gap = 0;
	}
	return ranks;
}

// Exports ---------------------------------------------------------------------

export default {
	// Constants
	RANK_DIGITS,
	// Codes
	getCode,
	// Lookup
	isInsufficient,
	// Ranking
	getCanonicalRank,
};
