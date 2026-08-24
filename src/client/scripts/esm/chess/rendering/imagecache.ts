// src/client/scripts/esm/chess/rendering/imagecache.ts

/**
 * This script caches the HTMLImageElement objects for the pieces.
 *
 * It assumes that `initImagesForGame` is called before any
 * attempt to retrieve an image using `getPieceImage`.
 *
 * Images depend only on piece type and theme, never the loaded game,
 * so the cache persists across games. Only a theme change invalidates it.
 */

import type { TypeGroup } from '../../../../../shared/util/typeutil.js';
import type { BoardPreview } from '../../../../../shared/chess/logic/boardpreviewer.js';

import typeutil from '../../../../../shared/util/typeutil.js';
import pieceThemes from '../../../../../shared/chess/util/pieceThemes.js';

import svgcache from './svgcache.js';
import svgtoimageconverter from '../../util/svgtoimageconverter.js';

// Variables ---------------------------------------------------------------------------

/**
 * The cache storing HTMLImageElement objects for each piece type.
 * Keys are the numeric piece types.
 */
let cachedImages: TypeGroup<HTMLImageElement> = {};

// Functions ---------------------------------------------------------------------------

/**
 * Initializes the image cache for the provided gamefile.
 * Fetches necessary SVGs (using svgcache), converts them to images,
 * normalizes them, and stores them in the cache.
 */
async function initImagesForGame(boardsim: BoardPreview): Promise<void> {
	// 1. Determine required piece types (excluding already-cached and SVG-less ones)
	const types = boardsim.existingTypes.filter(
		(t: number) => !cachedImages[t] && !pieceThemes.SVGLESS_TYPES.has(typeutil.getRawType(t)),
	);
	if (types.length === 0) return;

	// console.log("Needed piece types to load image cache:", types);

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
		const normalizationPromises: Promise<void>[] = [];

		for (const img of initialImages) {
			// Ensure the image has an ID which corresponds to the piece type
			if (!img.id) throw Error('Image is missing ID after conversion from SVG.');

			// Start normalization process for each image
			const promise = svgtoimageconverter
				.normalizeImagePixelData(img, 512) // High size to retain resolution during the drawing and re-serialization.
				.then((normalizedImg) => {
					cachedImages[Number(img.id)] = normalizedImg;
					// Optional: Log successful caching of a specific type
					// console.log(`Cached normalized image for type ${typeutil.debugType(Number(img.id))}`);
				})
				.catch((error) => {
					console.error(`Failed to normalize or cache image for type ${typeutil.debugType(Number(img.id))}:`, error); // prettier-ignore
					// Decide how to handle normalization failures - potentially throw?
				});
			normalizationPromises.push(promise);
		}

		// Wait for all normalizations to complete
		await Promise.all(normalizationPromises);

		// console.log(`Image cache initialization complete. Cached ${Object.keys(cachedImages).length} images.`);
	} catch (error) {
		console.error('Error during image cache initialization:', error);
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
	if (!image)
		throw new Error(`Image for piece type ${typeutil.debugType(type)} not found in cache. Was initImagesForGame() called?`); // prettier-ignore
	// Optional: Return a clone to prevent external modification of the cached element?
	// For simple display, returning the direct reference is usually fine and more performant.
	// If you plan to modify the image attributes (like style) elsewhere, cloning might be safer:
	// return image.cloneNode(true) as HTMLImageElement;
	return image;
}

/** Clears the image cache. Call this when the piece theme changes. */
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
