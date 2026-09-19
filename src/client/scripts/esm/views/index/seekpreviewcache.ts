// src/client/scripts/esm/views/index/seekpreviewcache.ts

/**
 * Client-side cache for seek variant previews.
 * When hovering a custom seek row, this fetches the position from the server via HTTP.
 */

import type { VariantOptions } from '../../../../../shared/chess/logic/gamefile.js';

import uuid from '../../../../../shared/util/uuid.js';
import icnimport from '../../../../../shared/chess/logic/icn/icnimport.js';
import icnconverter from '../../../../../shared/chess/logic/icn/icnconverter.js';

import { fetchWithDeduplication } from '../../util/fetchdeduplicator.js';

// State -----------------------------------------------------------------------

/** Resolved VariantOptions for previewed seeks, keyed by seek ID. */
const seekPreviewCache = new Map<number, VariantOptions>();

// Public API ------------------------------------------------------------------

/**
 * Returns the cached VariantOptions for a seek, fetching from the server if needed.
 * Returns `undefined` if the position is unavailable.
 * @param seekId - The ID of the seek to preview.
 */
async function getSeekPreview(seekId: number): Promise<VariantOptions | undefined> {
	const cached = seekPreviewCache.get(seekId);
	if (cached !== undefined) return cached;

	try {
		const url = `/api/seek-preview/${uuid.base10ToBase62(seekId)}`;
		const res = await fetchWithDeduplication(url);
		if (!res.ok) return undefined;
		const { icn } = (await res.json()) as { icn: string };

		const longFormat = icnconverter.ShortToLong_Format(icn);
		// Seeks are server-validated to always include an explicit position; no metadata fallback.
		const variantOptions = icnimport.variantOptionsFromLongFormat(longFormat);
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
function evictRemovedSeeks(currentSeekIds: Set<number>): void {
	for (const seekId of seekPreviewCache.keys()) {
		if (!currentSeekIds.has(seekId)) seekPreviewCache.delete(seekId);
	}
}

// Exports ---------------------------------------------------------------------

export default {
	getSeekPreview,
	evictRemovedSeeks,
};
