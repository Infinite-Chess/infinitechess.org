// src/shared/chess/variants/variantcache.ts

/**
 * Loads and manages cached variant modules.
 *
 * Variant info is only requested when needed, such as when previewing
 * them in a tooltip, or actually loading the variant in a game.
 */

import type { VariantCode } from './variantregistry.js';
import type { VariantModule } from '../variant_scripts/variantutil.js';

import variantregistry from './variantregistry.js';

// State ----------------------------------------------

const moduleCache = new Map<VariantCode, VariantModule>();

// Functions -------------------------------------------------------

/**
 * Ensures the module for the given variant is cached.
 * Only returns a `Promise<void>` when the module must be dynamically imported,
 * otherwise this is synchronious.
 */
function ensureVariantLoaded(variantCode: VariantCode): void | Promise<void> {
	if (moduleCache.has(variantCode)) return; // Already loaded — synchronous fast path
	const loader = variantregistry.getVariantLoader(variantCode);
	return loader().then((mod) => {
		console.log(`Variant "${variantCode}" loaded!`);
		moduleCache.set(variantCode, mod);
	});
}

/** Loads all variant modules. Call once at startup on the server. */
async function loadAllVariants(): Promise<void> {
	await Promise.all(variantregistry.VARIANT_CODES.map((code) => ensureVariantLoaded(code)));
	console.log('-- All variants loaded! --');
}

/**
 * Retrieves an already-loaded variant module from cache.
 * Throws if the variant has not been loaded yet via {@link ensureVariantLoaded} or {@link loadAllVariants}.
 * SHOULD ONLY ever be called immediately after calling {@link ensureVariantLoaded}, except
 * when on the server, as {@link loadAllVariants} should have already pre-loaded everything.
 */
function getModule(code: VariantCode): VariantModule {
	const mod = moduleCache.get(code);
	if (!mod) throw new Error(`Variant "${code}" not loaded. Call ensureVariantLoaded() first.`);
	return mod;
}

// Exports -----------------------------------------

export default {
	ensureVariantLoaded,
	loadAllVariants,
	getModule,
};
