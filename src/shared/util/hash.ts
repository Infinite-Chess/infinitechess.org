// src/shared/util/hash.ts

/**
 * Non-cryptographic 32-bit string hashing, for keys and fingerprints that need only be well
 * spread, never secret.
 */

// Constants -------------------------------------------------------------------

/** FNV-1a's own offset basis, the default starting value. */
const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
/** MurmurHash3's 32-bit finalizer multipliers. */
const MIX_MULTIPLIERS = [0x85ebca6b, 0xc2b2ae35] as const;

// Hashing ---------------------------------------------------------------------

/** The 32-bit FNV-1a hash of a string, started from `basis`. */
function fnv1a(text: string, basis = FNV_OFFSET_BASIS): number {
	let h = basis;
	for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), FNV_PRIME);
	return h >>> 0;
}

/**
 * MurmurHash3's 32-bit finalizer: spreads every input bit across the output. Hashes summed
 * together need it, since FNV's similar inputs give related outputs that sums would collide on.
 */
function mix(h: number): number {
	h = Math.imul(h ^ (h >>> 16), MIX_MULTIPLIERS[0]);
	h = Math.imul(h ^ (h >>> 13), MIX_MULTIPLIERS[1]);
	return (h ^ (h >>> 16)) >>> 0;
}

// Exports ---------------------------------------------------------------------

export default {
	fnv1a,
	mix,
};
