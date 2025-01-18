
/**
 * This scripts contains utility methods for working with colors,
 * such as getting the opposite color, trimming the color from type, etc.
 * 
 * ZERO depancies.
 */


// Type Definitions -----------------------------------------------------------------------------


/** A color in a length-4 array: `[r,g,b,a]` */
type Color = [number,number,number,number];


// Variables -----------------------------------------------------------------------------


/** All colors that are compatible with the game, EXCLUDING 'neutral'. */
const validColors_NoNeutral = ['white','black'];
const colorOfNeutrals = 'neutral';
/** All color-extensions that are compatible with the game, EXCLUDING neutrals. */
const validColorExtensions_NoNeutral = ['W','B'];
const colorExtensionOfNeutrals = 'N';

/** All colors that are compatible with the game. */
const validColors = [...validColors_NoNeutral, colorOfNeutrals];
/** All color-extensions that are compatible with the game. */
const validColorExtensions = [...validColorExtensions_NoNeutral, colorExtensionOfNeutrals];


// Functions -----------------------------------------------------------------------------


/**
 * Checks if a given player color is a valid color.
 */
function isValidColor(color: string): boolean {
	return validColors.includes(color);
}

/**
 * Checks if a given color is a valid color, EXCLUDING NEUTRALS, they will be marked as invalid.
 * @param {string} color - The color to check.
 * @returns {boolean} - Returns `true` if the color is valid, `false` otherwise.
 */
function isValidColor_NoNeutral(color: string): boolean {
	return validColors_NoNeutral.includes(color);
}

/**
 * Checks if a given color extension code is valid.
 * @param {string} colorExtension - 'W' or 'B' or 'N'
 * @returns {boolean} - Returns `true` if the color is valid, `false` otherwise.
 */
function isValidColorExtension(colorExtension: string): boolean {
	return validColorExtensions.includes(colorExtension);
}

/**
 * Checks if a given color extension code is valid, EXCLUDING 'N', that will be marked as invalid.
 * @param {string} colorExtension - The color to check.
 * @returns {boolean} - Returns `true` if the color is valid, `false` otherwise.
 */
function isValidColorExtension_NoNeutral(colorExtension: string): boolean {
	return validColorExtensions_NoNeutral.includes(colorExtension);
}

/**
 * Returns the color of the provided piece type
 * @param {string} type - The type of the piece (e.g., "pawnsW")
 * @returns {string | undefined} The color of the piece, "white", "black", or "neutral", or undefined if not valid
 */
function getPieceColorFromType(type: string): string {
	const colorExtension = getColorExtensionFromType(type);
	return getColorFromExtension(colorExtension);
}

/**
 * Returns the color associated with the given piece type color extension.
 * @param {string} colorExtention - The color extension: "W" / "B" / "N"
 * @returns {string} - The color (e.g. "white"/"black"/"neutral")
 */
function getColorFromExtension(colorExtention: string): string {
	const index = validColorExtensions.indexOf(colorExtention);
	if (index === -1) throw new Error(`Cannot get the color of invalid color extension "${colorExtention}"!`);
	return validColors[index]!;
}

/**
 * Returns the opposite color of the color provided.
 * @param {string} color - "White" / "Black"
 * @returns {string} The opposite color, "White" / "Black"
 */
function getOppositeColor(color: string): 'white' | 'black' {
	if (color === 'white') return 'black';
	else if (color === 'black') return 'white';
	else throw new Error(`Cannot return the opposite color of color ${color}!`);
}

/**
 * Returns the color extension code at the end of a piece type string.
 * REQUIRES the type of piece to be valid, and have a W or B at the end!
 * @param {string} type - "queensW"
 * @returns {string} The color extension: "W"
 */
function getColorExtensionFromType(type: string): string {
	return type.charAt(type.length - 1);
}

function getColorExtensionFromColor(color: string): string {
	const index = validColors.indexOf(color);
	if (index === -1) throw new Error(`Cannot get the extension of invalid color "${color}"!`);
	return validColorExtensions[index]!;
}

/**
 * Trims the W, B, or N from the end of the piece type. "pawnsW" => "pawns"
 * @param {string} type - The type of piece (eg "pawnsW").
 * @returns {string} The trimmed type.
 */
function trimColorExtensionFromType(type: string): string {
	return type.slice(0, -1); // Returns a new string that starts from the first character (index 0) and excludes the last character (because of -1).
}



export default {
	validColors,
	validColorExtensions,
	validColors_NoNeutral,
	colorOfNeutrals,
	validColorExtensions_NoNeutral,
	colorExtensionOfNeutrals,
	isValidColor,
	isValidColor_NoNeutral,
	isValidColorExtension,
	isValidColorExtension_NoNeutral,
	getPieceColorFromType,
	getColorFromExtension,
	getOppositeColor,
	getColorExtensionFromType,
	getColorExtensionFromColor,
	trimColorExtensionFromType,
};

export type {
	Color
};