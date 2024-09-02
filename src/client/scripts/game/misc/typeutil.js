
// Import Start

import colorutil from "./colorutil.js";

// Import End

/**
 * This script contains lists of all piece types currently in the game,
 * and has utility methods for iterating through them.
 */
const typeutil = (function() {

    /**
     * All piece types the game is currently compatible with (excluding neutrals).
     * 
     * They are arranged in this order for faster checkmate/draw detection,
     * as we should check if the kings have a legal move first.
     */
    const types = ['kings', 'giraffes', 'camels', 'zebras', 'knightriders', 'amazons', 'queens', 'royalQueens', 'hawks', 'chancellors', 'archbishops', 'centaurs', 'royalCentaurs', 'knights', 'guards', 'rooks', 'bishops', 'pawns'];

    /**
     * An object containing each color in the game, and all piece types associated with that color:
     * `{ white: ['kingsW', 'queensW'...], black: ['kingsB', 'queensB'...], neutral: ['obstaclesN','voidsN'] }`
     */
    const colorsTypes = {};
    colorutil.validColors_NoNeutral.forEach((color, index) => {
        const colorExtension = colorutil.validColorExtensions_NoNeutral[index];
        colorsTypes[color] = types.map(type => type + colorExtension);
    });
    colorsTypes.neutral = ['obstaclesN', 'voidsN'];

    /** A list of the royal pieces, without the color appended. */
    const royals = ['kings', 'royalQueens', 'royalCentaurs'];
    /** A list of the royals that are compatible with checkmate. */
    const jumpingRoyals = ['kings', 'royalCentaurs'];



    /**
     * Iterates through every single piece TYPE in the game state, and performs specified function on the type.
     * @param {function} callback - The function to execute on each type of piece. Must have 1 parameter of "type".
     * @param {Object} [options] - An object that may contain the options `ignoreNeutrals` or `ignoreVoids`. These default to *false*.
     */
    function forEachPieceType(callback, { ignoreNeutrals = false, ignoreVoids = false } = {}) { // Callback needs to have 1 parameter: type
        // Iterate through all colors in reverse order.
        // We do it in reverse so that white mini images
        // are rendered on top of black ones.
        Object.keys(colorsTypes).reverse().forEach(color => {
            if (ignoreNeutrals && color === 'neutral') return; // Skip 'neutral' if ignoreNeutrals is true
            colorsTypes[color].forEach(type => {
                if (ignoreVoids && type.startsWith('voids')) return; // Skip voids if ignoreVoids is true
                callback(type);
            });
        });
    }

    /**
     * A variant of {@link forEachPieceType} that allows an asynchronous callback function to be used.
     * 
     * Iterates through every single piece TYPE in the game state and performs the specified function on the type.
     * @param {function} callback - The function to execute on each type of piece. Must have 1 parameter of "type".
     * @param {Object} [options] - An object that may contain the options `ignoreNeutrals` or `ignoreVoids`. These default to *false*.
     */
    async function forEachPieceType_Async(callback, { ignoreNeutrals = false, ignoreVoids = false } = {}) { // Callback needs to have 1 parameter: type
        // Iterate through all colors in reverse order.
        for (const color of Object.keys(colorsTypes).reverse()) {
            if (ignoreNeutrals && color === 'neutral') continue; // Skip 'neutral' if ignoreNeutrals is true
            for (const type of colorsTypes[color]) {
                if (ignoreVoids && type.startsWith('voids')) continue; // Skip voids if ignoreVoids is true
                await callback(type);
            }
        }
    }

    // Iterates through every single piece TYPE in the game state of specified COLOR,
    // and performs specified function on the type
    function forEachPieceTypeOfColor(color, callback) {
        if (colorutil.isValidColor_NoNeutral(color)) throw new Error(`Cannot iterate through each piece type of invalid color '${color}'!`);
        for (let i = 0; i < types.length; i++) {
            callback(colorsTypes[color][i]);
        }
    }


    return Object.freeze({
        colorsTypes,
        royals,
        jumpingRoyals,
        forEachPieceType,
        forEachPieceType_Async,
        forEachPieceTypeOfColor,
    });

})();

export default typeutil;