// src/client/scripts/esm/webgl/TextureLoader.ts

interface Options {
	/** Whether to generate and use mipmaps for the texture. Default is false. */
	mipmaps?: boolean;
}

class TextureLoader {
	/** Default options if none are provided. */
	private static defaultOptions: Required<Options> = {
		mipmaps: false,
	};

	/**
	 * Loads a WebGL texture from an HTMLImageElement.
	 * @param gl - The WebGL2 rendering context.
	 * @param img - The HTMLImageElement from which to create the texture.
	 * @param options - Optional settings for texture creation.
	 * @returns The created WebGLTexture.
	 */
	public static loadTexture(
		gl: WebGL2RenderingContext,
		img: HTMLImageElement,
		options: Options = {},
	): WebGLTexture {
		const settings: Required<Options> = { ...this.defaultOptions, ...options };

		if (!isPowerOfTwo(img.naturalWidth) || !isPowerOfTwo(img.naturalHeight)) {
			throw new Error(
				`Image dimensions are not a power of two! Cannot use REPEAT wrapping mode. ${img.naturalWidth}x${img.naturalHeight}`,
			);
		}

		const texture = gl.createTexture();

		// Upload the image to the GPU
		gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); // Flip image pixels into the bottom-to-top order that WebGL expects.
		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);

		// Set filtering and mipmaps
		if (settings.mipmaps) {
			gl.generateMipmap(gl.TEXTURE_2D);

			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); // Smooth edges, mipmap interpollation (half-blurry all the time, EXCEPT with LOD bias of +0.5)
			// gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_LINEAR); // DEFAULT if not set. Jagged edges, mipmap interpollation (never blurry, though always jaggy)
			// gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_NEAREST); // Smooth edges, mipmap snapping (clear on some zoom levels, full blurry at others)
			// gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_NEAREST); // Jagged edges, mipmap snapping (jagged all the time)

			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); // Magnification, smooth edges (noticeable when zooming in)
		} else {
			// No mipmaps. Set wrapping
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); // Minification, smooth edges (not very noticeable)
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); // Magnification, hard edges. Gives that pixelated look required for low-resolution board tiles texture.
		}

		// Not needed since it's the default, but adds clarity.
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);

		gl.bindTexture(gl.TEXTURE_2D, null);

		return texture;
	}
}

function isPowerOfTwo(value: number): boolean {
	return (value & (value - 1)) === 0;
}

export default TextureLoader;
