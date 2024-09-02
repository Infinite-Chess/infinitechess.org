
// Import Start
import bufferdata from './bufferdata.js';
// Import End

/** 
 * Type Definitions 
 * @typedef {import('../chess/gamefile.js').gamefile} gamefile
 */

"use strict";

/**
 * This script generates the vertex data of the hidden coins
 */
const coin = (function() {

    /** Encrypted locations of the coins */
    const locations = ["xxg","cxhg","dvsi","wnnh","bsfvl","bciph","xwui","lprd","bxksd","brsvd","bnesg","beeud","wst","bqvoe","qmch","jshi","yqyg","rtja","bjohd","lrql","oyqo","bqxv","btqta","bdanl","bjwxi","byhah","zyrk","pdya","vpka","uqxd","tgrk","egzd","bqdhi","gcvh","osae","btrua","bclih","plgh","bfmsl","bsxza"];
    /** The string key used for encrypting and decrypting coordinates. */
    const encryption = 'jdhagkleioqcfmnzxyptsuvrw';

    /**
     * Appends the vertex data of the hidden coins to the `data32` and `data64`
     * properties of the provided mesh object.
     * @param {gamefile} gamefile - The gamefile
     * @param {number} currIndex - The index of the vertex data to start appending the coin vertex data.
     * @param {Object} mesh - An object containing the `data32` and `data64` properties of the pieces model currently being generated.
     * @param {boolean} usingColoredTextures - Whether we are using the coloredTextureProgram for rendering the pieces.
     * @returns {number} The next index in the vertex data after the coin data has been added.
     */
    function appDat(gamefile, currIndex, mesh, usingColoredTextures) {

        const { texStartX, texStartY, texEndX, texEndY } = bufferdata.getTexDataOfType('yellow'); // Coin

        for (let i = 0; i < locations.length; i += 2) {

            const xString = locations[i];
            const x = decryptCoordinate(xString);

            const yString = locations[i + 1];
            const y = decryptCoordinate(yString);

            const thisLocation = [x,y];

            const coordDataOfPiece = bufferdata.getCoordDataOfTile_WithOffset(gamefile.mesh.offset, thisLocation); // { startX, startY, endX, endY }
            const startX = coordDataOfPiece.startX;
            const startY = coordDataOfPiece.startY;
            const endX = coordDataOfPiece.endX;
            const endY = coordDataOfPiece.endY;
            
            const r = 1, g = 1, b = 1, a = 1;

            const data = usingColoredTextures ? bufferdata.getDataQuad_ColorTexture(startX, startY, endX, endY, texStartX, texStartY, texEndX, texEndY, r, g, b, a)
                : bufferdata.getDataQuad_Texture(startX, startY, endX, endY, texStartX, texStartY, texEndX, texEndY);

            for (let a = 0; a < data.length; a++) {
                mesh.data32[currIndex] = data[a];
                mesh.data64[currIndex] = data[a];
                currIndex++;
            }
        }

        return currIndex;
    }
    
    /**
     * Decrypts an encrypted coordinate.
     * @param {string} str - The ecnrypted string
     * @returns {number} The decrypted coordinate
     */
    function decryptCoordinate(str) {
        let result = 0;
        let base = 1;
        const isNegative = str.startsWith("b");

        if (isNegative) {
            str = str.substring(1);
        }

        const shifted = shiftString(str, -3);

        for (let i = shifted.length - 1; i >= 0; i--) {
            const value = encryption.indexOf(shifted[i]);
            result += value * base;
            base *= 25;
        }

        result /= 3; // The coin coords are divided by 3 to get the correct coordinate

        return isNegative ? -result : result;
    }

    /**
     * Shifts a string's characters by the specified amount.
     * Overflowing characters wrap around.
     * @param {string} str - The string to shift
     * @param {number} amt - The number of places to shift (positive = rightward)
     * @returns {string} The shifted string
     */
    function shiftString(str, amt) {
        const length = str.length;
    
        // Use modulo to handle cases where shiftAmount is larger than the string's length
        const actualShift = -amt % length;
    
        return str.slice(actualShift) + str.slice(0, actualShift);
    }

    function getCoinCount() {
        return locations.length / 2;
    }

    return Object.freeze({
        appDat,
        getCoinCount
    });

})();

export default coin;