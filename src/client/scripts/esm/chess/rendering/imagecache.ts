
/**
 * This script caches the HTMLImageElement objects for the pieces
 * required by the currently loaded game.
 *
 * It assumes that `initImagesForGame` is called before any
 * attempt to retrieve an image using `getPieceImage`.
 *
 * If no game is loaded, the cache should be empty.
 */

import type { TypeGroup } from '../../chess/util/typeutil.js';
// @ts-ignore
import type gamefile from '../../chess/logic/gamefile.js';

import typeutil from '../../chess/util/typeutil.js';
import svgcache from '../../chess/rendering/svgcache.js';
import svgtoimageconverter from '../../util/svgtoimageconverter.js';

// Variables ---------------------------------------------------------------------------

/**
 * The cache storing HTMLImageElement objects for each piece type
 * required by the current game. Keys are the numeric piece types.
 */
let cachedImages: TypeGroup<HTMLImageElement> = {};

// Functions ---------------------------------------------------------------------------

/**
 * Initializes the image cache for the provided gamefile.
 * Fetches necessary SVGs (using svgcache), converts them to images,
 * normalizes them, and stores them in the cache.
 */
async function initImagesForGame(gamefile: gamefile): Promise<void> {
	if (Object.keys(cachedImages).length > 0) throw Error("Image cache already initialized. Call deleteImageCache() when unloading games.");
	// console.log("Initializing image cache for game...");

	// 1. Determine required piece types (excluding SVG-less ones)
	const types = gamefile.existingTypes.filter((t: number) => !(typeutil.getRawType(t) in typeutil.SVGLESS_TYPES) );

	if (types.length === 0) {
		console.log("No piece types with SVGs found for this game. Image cache remains empty.");
		// Ensure cache is clean if re-initializing
		cachedImages = {};
		return;
	}

	// console.log("Required piece types for image cache:", types);

	try {
		// 2. Get SVG elements using the existing svgcache
		// No width/height needed here as normalization will handle sizing later
		const svgElements = await svgcache.getSVGElements(types);
		// console.log(`Retrieved ${svgElements.length} SVG elements.`);

		// 3. Convert SVGs to initial Image elements
		const initialImages = await svgtoimageconverter.convertSVGsToImages(svgElements);
		// console.log(`Converted ${initialImages.length} SVGs to initial images.`);

		// 4. Normalize images and populate the cache
		// Patches firefox bug that darkens the image (when it is partially transparent) caused by double-multiplying the RGB channels by the alpha channel
		const newCache: { [type: string]: HTMLImageElement } = {}; // 'pawn-white' => HTMLImageElement
		const normalizationPromises: Promise<void>[] = [];

		for (const img of initialImages) {
			// Ensure the image has an ID which corresponds to the piece type
			if (!img.id) throw Error("Image is missing ID after conversion from SVG.");

			// Start normalization process for each image
			const promise = svgtoimageconverter.normalizeImagePixelData(img)
				.then(normalizedImg => {
					newCache[img.id] = normalizedImg;
					// Optional: Log successful caching of a specific type
					// console.log(`Cached normalized image for type ${typeutil.debugType(Number(img.id))}`);
				})
				.catch(error => {
					console.error(`Failed to normalize or cache image for type ${typeutil.debugType(Number(img.id))}:`, error);
					// Decide how to handle normalization failures - potentially throw?
				});
			normalizationPromises.push(promise);
		}

		// Wait for all normalizations to complete
		await Promise.all(normalizationPromises);

		// Replace the old cache with the newly populated one
		cachedImages = newCache;

		// console.log(`Image cache initialization complete. Cached ${Object.keys(cachedImages).length} images.`);

	} catch (error) {
		console.error("Error during image cache initialization:", error);
		// Clear cache on failure to avoid partial state
		cachedImages = {};
		// Re-throw the error so the caller knows initialization failed
		throw error;
	}
}

/**
 * Retrieves a cached HTMLImageElement for the given piece type.
 * Throws an error if the image for the type is not found in the cache.
 * Assumes `initImagesForGame` has been successfully called beforehand.
 */
function getPieceImage(type: number): HTMLImageElement {
	const image = cachedImages[type];
	if (!image) throw new Error(`Image for piece type ${typeutil.debugType(type)} not found in cache. Was initImagesForGame() called?`);
	// Optional: Return a clone to prevent external modification of the cached element?
	// For simple display, returning the direct reference is usually fine and more performant.
	// If you plan to modify the image attributes (like style) elsewhere, cloning might be safer:
	// return image.cloneNode(true) as HTMLImageElement;
	return image;
}

/**
 * Clears the image cache. Call this when the game unloads.
 */
function deleteImageCache(): void {
	// console.log("Deleting image cache.");
	cachedImages = {};
}

// Exports -------------------------------------------------------------------

export default {
	initImagesForGame,
	getPieceImage,
	deleteImageCache,
};