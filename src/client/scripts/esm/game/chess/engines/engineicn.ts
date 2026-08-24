// src/client/scripts/esm/game/chess/engines/engineicn.ts

/**
 * Owns what an engine-bound ICN carries, so every engine entry point
 * (gameplay, local eval, game review) hands the engine the same thing.
 */

import type { LongFormatIn } from '../../../../../../shared/chess/logic/icn/icnconverter.js';

import icnconverter from '../../../../../../shared/chess/logic/icn/icnconverter.js';
import apeironborder from '../../../../../../shared/chess/logic/apeironborder.js';

/**
 * Conforms a freshly compressed longform to what Apeiron reads, in place.
 * Every engine entry point must run this before handing the longform (or its ICN) over.
 *
 * 1. Metadata is reduced to Variant, the only tag Apeiron reads. Redundant beside the explicit
 *    position, but it selects variant-specific search heuristics (correction history, Obstocean's
 *    quiescence generator) that measurably strengthen the engine, so it stays.
 * 2. The world border is clamped to the box Apeiron can actually evaluate in. Given none it
 *    assumes a far narrower 1e15, and an infinite edge (ICN's `_`) it can't read at all, so every
 *    position is handed an explicit border it can hold.
 *
 * Safe on a freshly compressed longform, whose metadata and gameRules are already copies.
 */
function prepareForEngine(longform: LongFormatIn): void {
	const { Variant } = longform.metadata;
	longform.metadata = Variant !== undefined ? { Variant } : {};
	longform.gameRules.worldBorder = apeironborder.clampToCap(
		longform.gameRules.worldBorder,
		Date.now(),
	);
}

/** Serializes an engine-bound longform to the compact ICN every engine consumes. */
function serialize(longform: LongFormatIn): string {
	return icnconverter.LongToShort_Format(longform, icnconverter.COMPACT_FORMAT_OPTIONS);
}

export default {
	prepareForEngine,
	serialize,
};
