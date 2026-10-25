// src/shared/chess/logic/icn/engineicn.ts

/**
 * Owns what an engine-bound ICN carries, so every engine entry point
 * hands the engine the same thing.
 */

import type { LongFormatIn } from './icnconverter.js';

import icnconverter from './icnconverter.js';

// Functions -------------------------------------------------------------------

/**
 * Conforms a longform to what Apeiron reads, in place: metadata is reduced to Variant, the only
 * tag Apeiron reads. Redundant beside the explicit position, but it selects variant-specific
 * search heuristics (correction history, Obstocean's quiescence generator) that measurably
 * strengthen the engine, so it stays. Every engine entry point must run this before handing the
 * longform (or its ICN) over; coordinates and border go as they are, however far.
 */
function prepareForEngine(longform: LongFormatIn): void {
	const { Variant } = longform.metadata;
	longform.metadata = Variant !== undefined ? { Variant } : {};
}

/** Serializes an engine-bound longform to the compact ICN every engine consumes. */
function serialize(longform: LongFormatIn): string {
	return icnconverter.LongToShort_Format(longform, icnconverter.COMPACT_FORMAT_OPTIONS);
}

// Exports ---------------------------------------------------------------------

export default {
	prepareForEngine,
	serialize,
};
