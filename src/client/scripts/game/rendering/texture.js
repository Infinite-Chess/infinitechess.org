
/*
 * This script loads textures
 */

// Import Start
import { gl } from './webgl.js';
import math from '../misc/math.js';
// Import End

const texture = (function() {

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
        if (textureElement == null) return console.error(`Unable to find of document texture element with id '${elementID}'!`);

        const texture = gl.createTexture(); // Create an empty texture object
        gl.bindTexture(gl.TEXTURE_2D, texture);
        
        const level = 0; // Mipmaps
        const internalFormat = gl.RGBA;
        const srcFormat = gl.RGBA;
        const srcType = gl.UNSIGNED_BYTE;
        gl.texImage2D(gl.TEXTURE_2D, level, internalFormat, srcFormat, srcType, textureElement);

        const powerOfTwo = math.isPowerOfTwo(textureElement.offsetWidth) && math.isPowerOfTwo(textureElement.offsetHeight);
        if (!powerOfTwo && useMipmaps) console.log(`Image ID ${elementID} dimensions is not a power of two! Unable to use mipmaps. Dimensions: ${textureElement.offsetWidth}x${textureElement.offsetHeight}`);

        // WebGL1 has different requirements for power of 2 images vs non power of 2 images so check if the image is a power of 2 in both dimensions.
        // If it's a power of 2, generate mipmaps.
        if (useMipmaps && powerOfTwo) gl.generateMipmap(gl.TEXTURE_2D);
        else { // Not power of 2. Turn off mips and set wrapping

            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); // CLAMP_TO_EDGE
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); // Pixelated look required for low-resolution board tiles texture.
        }

        gl.bindTexture(gl.TEXTURE_2D, null); // Unbind the texture.

        return texture;
    }

    return Object.freeze({
        loadTexture
    });

})();

export default texture;