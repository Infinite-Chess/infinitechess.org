// src/client/scripts/esm/chess/rendering/texturecache.ts

/**
 * This module handles the caching of WebGL textures of the pieces in our game.
 * It prevents redundant texture creation and data uploads to the GPU by caching
 * textures based on their source type. All textures are created with mipmaps enabled.
 *
 * This is a FACTORY: {@link createTextureCache} builds one cache bound to a single
 * WebGL context (textures can't be shared across contexts). The module default export
 * is the interactive game's cache; the variant-preview tooltip creates its own.
 */

import type { TypeGroup } from '../../../../../shared/util/typeutil.js';
import type { BoardPreview } from '../../../../../shared/chess/logic/boardpreviewer.js';

import typeutil from '../../../../../shared/util/typeutil.js';
import pieceThemes from '../../../../../shared/components/header/pieceThemes.js';

import imagecache from './imagecache.js';
import TextureLoader from '../../webgl/TextureLoader.js';

/** One independent texture cache, as returned by {@link createTextureCache}. */
export interface TextureCache {
	/**
	 * Initializes the texture cache for the provided gamefile.
	 * Retrieves necessary images from `imagecache`, creates WebGL textures
	 * (with mipmaps enabled) for each, and stores them in the cache.
	 * MUST be called after {@link imagecache.initImagesForGame}` has successfully completed.
	 * @param gl - The WebGL2 rendering context.
	 * @param boardsim - The board containing the list of piece types used.
	 */
	initTexturesForGame(_gl: WebGL2RenderingContext, _boardsim: BoardPreview): Promise<void>;
	/**
	 * Retrieves a WebGLTexture from the cache.
	 * ASSUMES `initTexturesForGame` has been called successfully for the current game.
	 * @param type - The piece type.
	 * @returns The cached WebGLTexture.
	 */
	getTexture(_type: number): WebGLTexture;
}

// Factory ----------------------------------------------------------

/**
 * Creates one independent piece-texture cache.
 * Its textures belong to whichever gl context uploads them.
 */
function createTextureCache(): TextureCache {
	/** Internal cache storing WebGLTexture objects, keyed by piece type. */
	const textureCache: TypeGroup<WebGLTexture> = {};

	async function initTexturesForGame(
		gl: WebGL2RenderingContext,
		boardsim: BoardPreview,
	): Promise<void> {
		// 1. Determine required piece types (mirroring imagecache logic, filter SVG-less)
		const types = boardsim.existingTypes.filter(
			(t: number) => !pieceThemes.SVGLESS_TYPES.has(typeutil.getRawType(t)),
		);

		// 2. Iterate and create textures for types not already cached
		for (const type of types) {
			if (textureCache[type]) continue;
			const img = imagecache.getPieceImage(type);
			textureCache[type] = TextureLoader.loadTexture(gl, img, { mipmaps: true });
		}
	}

	function getTexture(type: number): WebGLTexture {
		// 1. Check cache using type directly as the key
		const cachedTexture = textureCache[type];
		if (cachedTexture) return cachedTexture;
		// If not found, it implies initTexturesForGame wasn't called or failed for this type.
		else
			throw new Error(`TextureCache: Texture for type ${typeutil.debugType(type)} not found in cache. Was initTexturesForGame() called?`); // prettier-ignore
	}

	return {
		initTexturesForGame,
		getTexture,
	};
}

// The interactive game's texture cache. All existing `texturecache.foo()` call sites use this.
const gameTextureCache = createTextureCache();

export default gameTextureCache;
export { createTextureCache };
