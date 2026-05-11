// src/shared/chess/preview_variants/previewutil.ts

import type { GameRuleModifications } from '../variantgroups/variantgroups';

/**
 * Returns the minimum information needed to generate the variant
 * preview tooltip on the homepage when hovering over a variant.
 */
export interface VariantPreview {
	getPosition: () => Map<string, number>;
	gameruleModifications?: GameRuleModifications;
	/** If present, it's how many squares of padding exist between the furthest piece on each side to the world border. */
	worldBorderDist?: bigint;
}

/**
 * Selects the value from a time-versioned record whose key is the highest timestamp
 * less than or equal to the given timestamp. Falls back to the earliest entry if none apply.
 */
function resolveAtTimestamp<T>(entries: Record<number, T>, timestamp: number): T {
	const keys = Object.keys(entries)
		.map(Number)
		.sort((a, b) => b - a);
	return entries[keys.find((k) => timestamp >= k) ?? keys[keys.length - 1]!]!;
}

export default {
	resolveAtTimestamp,
};
