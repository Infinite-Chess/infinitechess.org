
/**
 * This module handles the caching of WebGL textures of the pieces in our game.
 * It prevents redundant texture creation and data uploads to the GPU by caching
 * textures based on their source type. All textures are created with mipmaps enabled.
 */

import imagecache from './imagecache.js'; // Adjust path as needed
import typeutil from '../../chess/util/typeutil.js'; // Import typeutil for filtering

import type { TypeGroup } from '../util/typeutil.js';
// @ts-ignore
import type gamefile from '../../chess/logic/gamefile.js';
// @ts-ignore
import texture from '../../game/rendering/texture.js';


// Texture Cache Implementation ----------------------------------------------------------


/** Internal cache storing WebGLTexture objects, keyed by piece type. */
let textureCache: TypeGroup<WebGLTexture> = {};

/**
 * Initializes the texture cache for the provided gamefile.
 * Retrieves necessary images from `imagecache`, creates WebGL textures
 * (with mipmaps enabled) for each, and stores them in the cache.
 * MUST be called after {@link imagecache.initImagesForGame}` has successfully completed.
 * @param gl - The WebGL2 rendering context.
 * @param gamefile - The gamefile object containing the list of piece types used.
 */
async function initTexturesForGame(gl: WebGL2RenderingContext, gamefile: gamefile): Promise<void> {
	// Clear existing cache before initializing for a new game
	if (Object.keys(textureCache).length > 0) throw Error("TextureCache: Cache already initialized. Call deleteTextureCache() when unloading games.");
	// console.log("Initializing texture cache for game...");

	// 1. Determine required piece types (mirroring imagecache logic, filter SVG-less)
	const types = gamefile.existingTypes.filter((t: number) => !(typeutil.getRawType(t) in typeutil.SVGLESS_TYPES) );

	if (types.length === 0) return console.log("TextureCache: No piece types with SVGs found for this game. Texture cache remains empty.");

	// console.log("Required piece types for texture cache:", types);

	// 2. Iterate and create textures
	for (const type of types) {
		// Retrieve the pre-cached loaded image
		const textureElement = imagecache.getPieceImage(type);
		textureCache[type] = texture.loadTexture(gl, textureElement, { useMipmaps: true });
		// console.log(`TextureCache: Cached texture for type ${typeutil.debugType(type)}`);
	}
	// console.log(`TextureCache: Initialization complete. Cached ${Object.keys(textureCache).length} textures.`);
}


/**
 * Retrieves a WebGLTexture from the cache.
 * ASSUMES `initTexturesForGame` has been called successfully for the current game.
 * @param type - The piece type.
 * @returns The cached WebGLTexture.
 */
function getTexture(type: number): WebGLTexture {
	// 1. Check cache using type directly as the key
	const cachedTexture = textureCache[type];
	if (cachedTexture) return cachedTexture;
	// If not found, it implies initTexturesForGame wasn't called or failed for this type.
	else throw new Error(`TextureCache: Texture for type ${typeutil.debugType(type)} not found in cache. Was initTexturesForGame() called?`);
}

/**
 * Deletes all textures currently stored in the cache from the GPU memory
 * and clears the internal cache object.
 *
 * **Important:** This requires the same WebGL context that was used to create the textures.
 * Call this when the WebGL context is being destroyed or the cached textures are no longer needed
 * to prevent GPU memory leaks.
 */
function deleteTextureCache(gl: WebGL2RenderingContext): void {
	console.log("TextureCache: Deleting all cached textures...");
	for (const key in textureCache) gl.deleteTexture(textureCache[key]!);
	textureCache = {}; // Clear the cache object
	console.log(`TextureCache: Deleted textures from GPU and cleared cache.`);
}


// Exports --------------------------------------------------------------------


export default {
	initTexturesForGame, // Add the init function to exports
	getTexture,
	deleteTextureCache,
};