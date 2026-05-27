// src/client/scripts/esm/views/index/seekPreviewCache.ts

/**
 * Client-side cache for seek variant previews.
 * When hovering a custom seek row, this fetches the position from the server via HTTP.
 */

import type { VariantOptions } from '../../../../../shared/chess/logic/gamefile.js';

import icnimport from '../../../../../shared/chess/logic/icn/icnimport.js';
import icnconverter from '../../../../../shared/chess/logic/icn/icnconverter.js';
import variantregistry from '../../../../../shared/chess/variants/variantregistry.js';

import { fetchWithDeduplication } from '../../util/fetchDeduplicator.js';

// State -----------------------------------------------------------------------

/** Resolved VariantOptions for previewed seeks, keyed by seek ID. */
const seekPreviewCache = new Map<string, VariantOptions>();

// Public API ------------------------------------------------------------------

/**
 * Returns the cached VariantOptions for a seek, fetching from the server if needed.
 * Returns `undefined` if the position is unavailable.
 * @param seekId - The ID of the seek to preview.
 */
async function getSeekPreview(seekId: string): Promise<VariantOptions | undefined> {
	const cached = seekPreviewCache.get(seekId);
	if (cached !== undefined) return cached;

	try {
		const res = await fetchWithDeduplication(`/api/seek-preview/${seekId}`);
		if (!res.ok) return undefined;
		const { icn } = (await res.json()) as { icn: string };

		const longFormat = icnconverter.ShortToLong_Format(icn);
		const variantCode = variantregistry.resolveVariantCode(longFormat.metadata.Variant);
		const { position, specialRights } =
			await icnimport.getPositionAndSpecialRightsFromLongFormat(longFormat, variantCode);
		const variantOptions: VariantOptions = {
			position,
			gameRules: longFormat.gameRules,
			state_global: {
				...longFormat.state_global,
				specialRights,
			},
			fullMove: longFormat.fullMove,
		};
		seekPreviewCache.set(seekId, variantOptions);
		return variantOptions;
	} catch (err) {
		console.error(`Failed to fetch/parse preview for seek:`, err);
		return undefined;
	}
}

/**
 * Removes cache entries for seek IDs no longer in the lobby list.
 * @param currentSeekIds - The set of seek IDs present in the latest server update.
 */
function evictRemovedSeeks(currentSeekIds: Set<string>): void {
	for (const seekId of seekPreviewCache.keys()) {
		if (!currentSeekIds.has(seekId)) seekPreviewCache.delete(seekId);
	}
}

// Exports ---------------------------------------------------------------------

export default {
	getSeekPreview,
	evictRemovedSeeks,
};
