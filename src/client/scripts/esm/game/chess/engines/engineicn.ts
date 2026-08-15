// src/client/scripts/esm/game/chess/engines/engineicn.ts

/**
 * Owns what an engine-bound ICN carries, so every engine entry point
 * (gameplay, local eval, game review) hands the engine the same thing.
 */

import type { LongFormatIn } from '../../../../../../shared/chess/logic/icn/icnconverter.js';

import icnconverter from '../../../../../../shared/chess/logic/icn/icnconverter.js';

/**
 * Reduces a longform's metadata to the single tag Apeiron reads. Its ICN parser skips every
 * bracketed tag but Variant, which selects variant-specific search heuristics (correction
 * history, Obstocean's quiescence generator) — kept deliberately, even though the position is
 * always given explicitly, because it measurably strengthens the engine on those variants.
 *
 * Mutates in place. Safe on a freshly compressed longform, whose metadata is already a copy.
 */
function stripToEngineMetadata(longform: LongFormatIn): void {
	const { Variant } = longform.metadata;
	longform.metadata = Variant !== undefined ? { Variant } : {};
}

/** Serializes an engine-bound longform to the compact ICN every engine consumes. */
function serialize(longform: LongFormatIn): string {
	return icnconverter.LongToShort_Format(longform, icnconverter.COMPACT_FORMAT_OPTIONS);
}

export default {
	stripToEngineMetadata,
	serialize,
};
