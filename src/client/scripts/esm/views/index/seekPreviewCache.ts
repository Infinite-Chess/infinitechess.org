// src/client/scripts/esm/views/index/seekPreviewCache.ts

/**
 * Client-side cache for seek variant previews.
 * When hovering a custom seek row, this fetches the position from the server via HTTP.
 */

import type { VariantOptions } from '../../../../../shared/chess/logic/gamefile.js';

import icnimport from '../../../../../shared/chess/logic/icn/icnimport.js';
import icnconverter from '../../../../../shared/chess/logic/icn/icnconverter.js';
import variantregistry from '../../../../../shared/chess/variants/variantregistry.js';

// State -----------------------------------------------------------------------

/** Resolved VariantOptions for previewed seeks, keyed by seek ID. */
const seekPreviewCache = new Map<string, VariantOptions>();

/** In-flight fetch requests, keyed by seek ID. */
const seekPreviewPending = new Map<
	string,
	{
		promise: Promise<VariantOptions | undefined>;
		abort: AbortController;
	}
>();

// Public API ------------------------------------------------------------------

/**
 * Returns the cached VariantOptions for a seek, fetching from the server if needed.
 * Returns `undefined` if the position is unavailable.
 * @param seekId - The ID of the seek to preview.
 */
async function getSeekPreview(seekId: string): Promise<VariantOptions | undefined> {
	if (seekPreviewCache.has(seekId)) return seekPreviewCache.get(seekId)!;
	const existing = seekPreviewPending.get(seekId);
	if (existing !== undefined) return existing.promise;

	const abort = new AbortController();
	const promise = (async (): Promise<VariantOptions | undefined> => {
		try {
			const res = await fetch(`/api/seek-preview/${seekId}`, { signal: abort.signal });
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
			if ((err as Error).name !== 'AbortError')
				console.error(
					`seekPreviewCache: failed to fetch/parse preview for seek "${seekId}":`,
					err,
				);
			return undefined;
		} finally {
			seekPreviewPending.delete(seekId);
		}
	})();

	seekPreviewPending.set(seekId, { promise, abort });
	return promise;
}

/**
 * Removes cache and pending entries for seek IDs no longer in the lobby list.
 * Aborts in-flight requests for removed seeks.
 * @param currentSeekIds - The set of seek IDs present in the latest server update.
 */
function evictRemovedSeeks(currentSeekIds: Set<string>): void {
	for (const seekId of seekPreviewCache.keys()) {
		if (!currentSeekIds.has(seekId)) seekPreviewCache.delete(seekId);
	}
	for (const [seekId, { abort }] of seekPreviewPending) {
		if (!currentSeekIds.has(seekId)) abort.abort(); // cleanup happens in promise's finally
	}
}

// Exports ---------------------------------------------------------------------

export default {
	getSeekPreview,
	evictRemovedSeeks,
};
