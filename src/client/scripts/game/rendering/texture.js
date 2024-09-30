
// Import Start
import { gl } from './webgl.js';
import math from '../misc/math.js';
// Import End

/** This script loads textures. */

// Init a texture from an element from the document. Can be called from any script.

/**
 * Creates a texture object from a document element that can be bound before rendering.
 * @param {string} elementID - The ID of the html `<img>` element.
 * @param {Object} options - An object that may contain the `useMipmaps` property, which is *false* by default.
 * @returns {Object} The texture object 
 */
function loadTexture(elementID, { useMipmaps = false } = {}) {

	// Flip image pixels into the bottom-to-top order that WebGL expects.
	gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

	const textureElement = document.getElementById(elementID);
	if (textureElement === undefined) throw new Error(`Unable to find of document texture element with id '${elementID}'!`);

	const texture = gl.createTexture(); // Create an empty texture object
	gl.bindTexture(gl.TEXTURE_2D, texture);
    
	const level = 0; // Mipmaps level
	const internalFormat = gl.RGBA;
	const srcFormat = gl.RGBA;
	const srcType = gl.UNSIGNED_BYTE;
	gl.texImage2D(gl.TEXTURE_2D, level, internalFormat, srcFormat, srcType, textureElement);

	const isPowerOf2 = math.isPowerOfTwo(textureElement.naturalWidth) && math.isPowerOfTwo(textureElement.naturalHeight);
	if (!isPowerOf2 && useMipmaps) console.error(`Image ID ${elementID} dimensions is not a power of two! Unable to use mipmaps. Dimensions: ${textureElement.naturalWidth}x${textureElement.naturalHeight}`);

	if (useMipmaps && isPowerOf2) {
		gl.generateMipmap(gl.TEXTURE_2D);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); // Smooth interpollation between mipmaps (VERY noticeable), AND smooth edges (not very noticable)
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); // Magnification, smooth edges (noticeable when zooming in)
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
	loadTexture
};