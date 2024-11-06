
// Import Start
import math from '../misc/math.js';
// Import End

/** This script loads textures. */

// Init a texture from an element from the document. Can be called from any script.

/**
 * Creates a texture object from either an HTML `<img>` element or the ID of such an element, which can be bound before rendering.
 * @param {WebGL2RenderingContext} gl - The webgl context being used
 * @param {HTMLImageElement|string} textureElementOrID - Either the HTML `<img>` element itself or the ID of the `<img>` element.
 * @param {Object} options - An object that may contain the `useMipmaps` property, which is *false* by default.
 * @returns {WebGLTexture} The texture object.
 */
function loadTexture(gl, textureElementOrID, { useMipmaps = false } = {}) {

	// If a string is passed, assume it's an ID and get the element
	let textureElement = textureElementOrID;
	if (typeof textureElementOrID === 'string') {
		textureElement = document.getElementById(textureElementOrID);
		if (!textureElement) {
			throw new Error(`No element found with ID: '${textureElementOrID}'`);
		}
	}

	// Ensure the element is an HTMLImageElement
	if (!(textureElement instanceof HTMLImageElement)) {
		throw new Error(`The provided texture element is not a valid HTMLImageElement: ${JSON.stringify(textureElement)}`);
	}

	// Flip image pixels into the bottom-to-top order that WebGL expects.
	gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

	const texture = gl.createTexture(); // Create an empty texture object
	gl.bindTexture(gl.TEXTURE_2D, texture);
    
	const level = 0; // Mipmaps level
	const internalFormat = gl.RGBA;
	const srcFormat = gl.RGBA;
	const srcType = gl.UNSIGNED_BYTE;
	gl.texImage2D(gl.TEXTURE_2D, level, internalFormat, srcFormat, srcType, textureElement);

	const isPowerOf2 = math.isPowerOfTwo(textureElement.naturalWidth) && math.isPowerOfTwo(textureElement.naturalHeight);
	if (!isPowerOf2 && useMipmaps) {
		console.error(`Image dimensions are not a power of two! Unable to use mipmaps. Dimensions: ${textureElement.naturalWidth}x${textureElement.naturalHeight}`);
	}

	if (useMipmaps && isPowerOf2) {
		gl.generateMipmap(gl.TEXTURE_2D);
		// gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_LINEAR); // DEFAULT if not set. Jagged edges, mipmap interpollation (never blurry, though always jaggy)
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); // Smooth edges, mipmap interpollation (half-blurry all the time, EXCEPT with LOD bias)
		// gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_NEAREST); // Smooth edges, mipmap snapping (clear on some zoom levels, full blurry at others)
		// gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_NEAREST); // Jagged edges, mipmap snapping (jagged all the time)

		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); // Magnification, smooth edges (noticeable when zooming in)

		// Force WebGL to only use specific mipmap level
		// const mipmaplevel = 0;
		// gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_BASE_LEVEL, mipmaplevel);
		// gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, mipmaplevel);

		// Get the current filtering mode for MIN and MAG
		// const minFilter = gl.getTexParameter(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER);
		// const magFilter = gl.getTexParameter(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER);
		// // Log the values to the console
		// console.log('Current TEXTURE_MIN_FILTER:', minFilter);
		// console.log('Current TEXTURE_MAG_FILTER:', magFilter);
	} else { // Not using mipmaps. Turn off mips and set wrapping
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); // Minification, smooth edges (not very noticeable)
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); // Magnification, hard edges. Gives that pixelated look required for low-resolution board tiles texture.
	}

	gl.bindTexture(gl.TEXTURE_2D, null); // Unbind the texture.

	return texture;
}

export default {
	loadTexture,
};