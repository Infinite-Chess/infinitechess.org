// src/shared/chess/logic/positionkey.ts

/**
 * A position's 64-bit key: the side to move, and every piece's type and square. Nothing else
 * counts: no special rights, move history or gamerules, so a position rebuilt in the board editor
 * keys the same as the game it was copied from. Order-free, so two boards holding the same pieces
 * key alike however their pieces are organized.
 *
 * Engine-assistance detection compares the analysis page's positions against live games' by it.
 */

import type { Player } from '../util/typeutil.js';
import type { OrganizedPiecesBase } from './organizedpieces.js';

import hash from '../../util/hash.js';

// Constants -------------------------------------------------------------------

/** The FNV offset basis of the key's second 32-bit half, independent of the first's default one. */
const SECOND_HALF_BASIS = 0x2b992ddf;
/** What a key looks like: the side to move, then 16 hex digits. */
const PATTERN = /^\d+:[0-9a-f]{16}$/;

// Keying ----------------------------------------------------------------------

/** The key of `pieces` with `sideToMove` to move, e.g. `1:9f3a…` (16 hex digits). */
function of(pieces: Pick<OrganizedPiecesBase, 'coords' | 'types'>, sideToMove: Player): string {
	let high = 0;
	let low = 0;
	for (const [coordsKey, idx] of pieces.coords) {
		const entry = `${coordsKey},${pieces.types[idx]}`;
		high = (high + hash.mix(hash.fnv1a(entry))) >>> 0;
		low = (low + hash.mix(hash.fnv1a(entry, SECOND_HALF_BASIS))) >>> 0;
	}
	return `${sideToMove}:${toHex(high)}${toHex(low)}`;
}

/** A 32-bit value as 8 hex digits. */
function toHex(value: number): string {
	return value.toString(16).padStart(8, '0');
}

// Exports ---------------------------------------------------------------------

export default {
	// Constants
	PATTERN,
	// Keying
	of,
};
