
// Import Start
import colorutil from "./colorutil.js";
// Import End

/**
 * This script contains lists of all piece types currently in the game,
 * and has utility methods for iterating through them.
 */

/**
 * All piece types the game is currently compatible with (excluding neutrals).
 * 
 * They are arranged in this order for faster checkmate/draw detection,
 * as we should check if the kings have a legal move first.
 */
const types = ['kings', 'giraffes', 'camels', 'zebras', 'knightriders', 'amazons', 'queens', 'royalQueens', 'hawks', 'chancellors', 'archbishops', 'centaurs', 'royalCentaurs', 'knights', 'guards', 'rooks', 'bishops', 'pawns'];
/** All neutral types the game is compatible with. */
const neutralTypes = ['voids', 'obstacles'];
const alltypes = [...neutralTypes, ...types];
/** A list of the royals that are compatible with checkmate. If a royal can slide, DO NOT put it in here, put it in {@link slidingRoyals} instead! */
let jumpingRoyals = ['kings', 'royalCentaurs'];
/** A list of the royals that are NOT compatible with checkmate, but must use royalcapture. */
const slidingRoyals = ['royalQueens'];
/** A list of the royal pieces, without the color appended. */
let royals = [...jumpingRoyals, ...slidingRoyals];
const intTypes = {
    voidsN: 0,
    obstaclesN: 1,
    'kings-': 2,
    'giraffes-': 3,
    'camels-': 4,
    'zebras-': 5,
    'knightriders-': 6,
    'amazons-': 7,
    'queens-': 8,
    'royalQueens-': 9,
    'hawks-': 10,
    'chancellors-': 11,
    'archbishops-': 12,
    'centaurs-': 13,
    'royalCentaurs-': 14,
    'knights-': 15,
    'guards-': 16,
    'rooks-': 17,
    'bishops-': 18,
    'pawns-': 19,
    kingsW: 20,
    giraffesW: 21,
    camelsW: 22,
    zebrasW: 23,
    knightridersW: 24,
    amazonsW: 25,
    queensW: 26,
    royalQueensW: 27,
    hawksW: 28,
    chancellorsW: 29,
    archbishopsW: 30,
    centaursW: 31,
    royalCentaursW: 32,
    knightsW: 33,
    guardsW: 34,
    rooksW: 35,
    bishopsW: 36,
    pawnsW: 37,
    kingsB: 38,
    giraffesB: 39,
    camelsB: 40,
    zebrasB: 41,
    knightridersB: 42,
    amazonsB: 43,
    queensB: 44,
    royalQueensB: 45,
    hawksB: 46,
    chancellorsB: 47,
    archbishopsB: 48,
    centaursB: 49,
    royalCentaursB: 50,
    knightsB: 51,
    guardsB: 52,
    rooksB: 53,
    bishopsB: 54,
    pawnsB: 55,
};

royals = royals.map(type => intTypes[`${type}-`]);
jumpingRoyals = jumpingRoyals.map(type => intTypes[`${type}-`]);
/**
 * An object containing each color in the game, and all piece types associated with that color:
 * `{ white: ['kingsW', 'queensW'...], black: ['kingsB', 'queensB'...], neutral: ['obstaclesN','voidsN'] }`
 */
const colorsTypes = {};
colorutil.validColors_NoNeutral.forEach((color, index) => {
    const colorExtension = (index + 1) * types.length;
    colorsTypes[color] = [...types.keys()].map(type => type + colorExtension + neutralTypes.length);
});
colorsTypes.neutral = [...neutralTypes.keys()];

console.log(alltypes.length);

// /**
//  * 
//  * @param {string} type
//  * @returns {Number}
//  */
// function getNumFromType(type) {
//     const c = colorutil.getColorIndex(type);
//     type = typeutil.trimColorExtensionFromType(type);
//     if (c === 0) {
//         return neutralTypes.indexOf(type);
//     }
//     return (c - 1) * types.length + types.indexOf() + neutralTypes.length;
// }

/**
 * 
 * @param {Number} type
 * @returns {Number}
 */
function trimColorExtensionFromType(type) {
    if (type < neutralTypes.length) {
        return type;
    }
    type -= neutralTypes.length;
    type %= types.length;
    type += neutralTypes.length;
    if (type < 0) throw new Error("type is less than 0");
    return type;
}

function getColorExtensionFromColor(color) {
    const ext = colorutil.validColors.indexOf(color);
    if (ext <= 1) return 0;
    return (ext - 1) * types.length;
}

function getPieceColorFromType(type) {
    if (type < neutralTypes.length) {
        return colorutil.validColors[0];
    }
    type -= neutralTypes.length;
    return colorutil.validColors[~~(type / types.length) + 1];
}

function isRawType(type, rawName) {
    return trimColorExtensionFromType(type) === intTypes[`${rawName}-`];
}

/**
 * 
 * @param {Number} num 
 * @returns {String}
 */
function getTypeFromNum(num) {
    if (num < neutralTypes.length) {
        return neutralTypes[num] + colorutil.colorExtensionOfNeutrals;
    }
    num -= neutralTypes.length;
    const ptype = types[num % types.length];
    const pcolor = colorutil.validColorExtensions_NoNeutral[~~(num / types.length) - 1];
    return ptype + pcolor;
}

/**
 * Iterates through every single piece TYPE in the game state, and performs specified function on the type.
 * @param {function} callback - The function to execute on each type of piece. Must have 1 parameter of "type".
 * @param {Object} [options] - An object that may contain the options `ignoreNeutrals` or `ignoreVoids`. These default to *false*.
 */
function forEachPieceType(callback, { ignoreNeutrals, ignoreVoids } = {}) { // Callback needs to have 1 parameter: type
    // Iterate through all colors in reverse order.
    // We do it in reverse so that white mini images
    // are rendered on top of black ones.
    Object.keys(colorsTypes).reverse().forEach(color => {
        if (ignoreNeutrals && color === colorutil.colorOfNeutrals) return; // Skip 'neutral' if ignoreNeutrals is true
        colorsTypes[color].forEach(type => {
            if (ignoreVoids && type === 0) return; // Skip voids if ignoreVoids is true
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
        if (ignoreNeutrals && color === colorutil.colorOfNeutrals) continue; // Skip 'neutral' if ignoreNeutrals is true
        for (const type of colorsTypes[color]) {
            if (ignoreVoids && type === 0) continue; // Skip voids if ignoreVoids is true
            await callback(type);
        }
    }
}

// Iterates through every single piece TYPE in the game state of specified COLOR,
// and performs specified function on the type
function forEachPieceTypeOfColor(color, callback) {
    if (!colorutil.isValidColor_NoNeutral(color)) throw new Error(`Cannot iterate through each piece type of invalid color '${color}'!`);
    for (let i = 0; i < types.length; i++) {
        callback(colorsTypes[color][i]);
    }
}

export default {
    colorsTypes,
    royals,
    intTypes,
    jumpingRoyals,
    forEachPieceType,
    forEachPieceType_Async,
    forEachPieceTypeOfColor,
    trimColorExtensionFromType,
    getColorExtensionFromColor,
    getPieceColorFromType,
    getTypeFromNum,
    isRawType,
};