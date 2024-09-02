
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
     * @param {Object} [options] An object that may contain the options `ignoreNeutrals` or `ignoreVoids`. These default to *false*.
     */
    function forEachPieceType(callback, { ignoreNeutrals = false, ignoreVoids = false } = {}) { // Callback needs to have 1 parameter: type
        for (let i = 0; i < colorsTypes.white.length; i++) {
            // We iterate through black types first so that the white icons render on top!
            callback(colorsTypes.black[i]);
            callback(colorsTypes.white[i]);
        }
        if (ignoreNeutrals) return;
        for (let i = 0; i < colorsTypes.neutral.length; i++) {
            const type = colorsTypes.neutral[i];
            if (ignoreVoids && type.startsWith('voids')) continue;
            callback(type);
        }
    }

    /**
     * A variant of {@link forEachPieceType} that allows an asynchronious callback function to be used.
     * 
     * Iterates through every single piece TYPE in the game state, and performs specified function on the type
     * @param {function} callback - The function to execute on each type of piece. Must have 1 parameter of "type".
     * @param {Object} [options] An object that may contain the options `ignoreNeutrals` or `ignoreVoids`. These default to *false*.
     */
    async function forEachPieceType_Async(callback, { ignoreNeutrals = false, ignoreVoids = false } = {}) { // Callback needs to have 1 parameter: type
        for (let i = 0; i < colorsTypes.white.length; i++) {
            // We iterate through black types first so that the white icons render on top!
            await callback(colorsTypes.black[i]);
            await callback(colorsTypes.white[i]);
        }
        if (ignoreNeutrals) return;
        for (let i = 0; i < colorsTypes.neutral.length; i++) {
            const type = colorsTypes.neutral[i];
            if (ignoreVoids && type.startsWith('voids')) continue;
            await callback(type);
        }
    }

    // Iterates through every single piece TYPE in the game state of specified COLOR,
    // and performs specified function on the type
    function forEachPieceTypeOfColor(color, callback) {
        if (color !== 'white' && color !== 'black') throw new Error(`Cannot iterate through each piece type of invalid color: ${color}!`);
        for (let i = 0; i < colorsTypes.white.length; i++) callback(typeutil[color][i]);
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