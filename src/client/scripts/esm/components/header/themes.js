
// This module stores our themes. Straight forward :P

// Strings to avoid redundancy and compact the script
const a = "lightTiles";
const b = "darkTiles";
const c = "legalMovesHighlightColor_Friendly";
const d = "legalMovesHighlightColor_Opponent";
const e = "legalMovesHighlightColor_Premove";
const f = "lastMoveHighlightColor";
const g = "checkHighlightColor";

/**
 * Fallback properties for a themes properties
 * to use if it doesn't have them present
 */
const defaults = {
	[f]: /* lastMoveHighlightColor */ [0.72, 1, 0, 0.28],
	[g]: /* checkHighlightColor */ [1, 0, 0, 0.7],
	// If this is false, we will render them white,
	// utilizing the more efficient color-less shader program!
	useColoredPieces: false,
	whitePiecesColor: [1, 1, 1, 1],
	blackPiecesColor: [1, 1, 1, 1],
	neutralPiecesColor: [1, 1, 1, 1],
};

const defaultTheme = 'wood_light';

const themeDictionary = {

	wood_light: { // 5D Chess
		[a]: /* lightTiles */ [1, 0.85, 0.66, 1],
		[b]: /* darkTiles */ [0.87, 0.68, 0.46, 1],
		[c]: /* legalMovesHighlightColor_Friendly */ [0, 0.5, 0.14, 0.38],
		[d]: /* legalMovesHighlightColor_Opponent */ [1, 0.18, 0, 0.37],
		[e]: /* legalMovesHighlightColor_Premove */ [0, 0, 0.38, 0.32],
		[f]: /* lastMoveHighlightColor */ [0.90, 1, 0, 0.30],
	},
	sandstone: { // Sometimes thanksgiving uses this
		[a]: /* lightTiles */ [0.94, 0.88, 0.78, 1],
		[b]: /* darkTiles */ [0.74, 0.63, 0.53, 1],
		[c]: /* legalMovesHighlightColor_Friendly */ [1, 0.2, 0, 0.35], // 0.5 for BIG positions   0.35 for SMALL
		[d]: /* legalMovesHighlightColor_Opponent */ [1, 0.7, 0, 0.35],
		[e]: /* legalMovesHighlightColor_Premove */ [0, 0, 0.38, 0.28],
		[f]: /* lastMoveHighlightColor */ [0.3, 1, 0, 0.35], // 0.3 for small, 0.35 for BIG positions
	},
	wood: {
		[a]: /* lightTiles */ [0.96, 0.87, 0.75, 1],
		[b]: /* darkTiles */ [0.71, 0.54, 0.38, 1],
		[c]: /* legalMovesHighlightColor_Friendly */ [0, 0.48, 0.1, 0.42],
		[d]: /* legalMovesHighlightColor_Opponent */ [1, 0.18, 0, 0.43],
		[e]: /* legalMovesHighlightColor_Premove */ [0, 0, 0.38, 0.32],
	},
	sandstone_dark: {
		[a]: /* lightTiles */ [0.86, 0.76, 0.50, 1],
		[b]: /* darkTiles */ [0.69, 0.55, 0.35, 1],
		[c]: /* legalMovesHighlightColor_Friendly */ [0, 0.48, 0.1, 0.32],
		[d]: /* legalMovesHighlightColor_Opponent */ [1, 0.18, 0, 0.29],
		[e]: /* legalMovesHighlightColor_Premove */ [0, 0, 0.38, 0.28],
	},
	maple: {
		[a]: /* lightTiles */ [0.96, 0.81, 0.65, 1],
		[b]: /* darkTiles */ [0.83, 0.52, 0.32, 1],
		[c]: /* legalMovesHighlightColor_Friendly */ [0, 0.48, 0.1, 0.32],
		[d]: /* legalMovesHighlightColor_Opponent */ [1, 0.52, 0, 0.57],
		[e]: /* legalMovesHighlightColor_Premove */ [0, 0, 0.38, 0.28],
	},
	red_wood: {
		[a]: /* lightTiles */ [0.96, 0.82, 0.7, 1],
		[b]: /* darkTiles */ [0.76, 0.35, 0.24, 1],
		[c]: /* legalMovesHighlightColor_Friendly */ [0, 0.48, 0.1, 0.48],
		[d]: /* legalMovesHighlightColor_Opponent */ [1, 0.52, 0, 0.61],
		[e]: /* legalMovesHighlightColor_Premove */ [0, 0, 0.38, 0.36],
	},
	cyan_ocean: {
		[a]: /* lightTiles */ [0.06, 1, 1, 1],
		[b]: /* darkTiles */ [0.18, 0.76, 0.78, 1],
		[c]: /* legalMovesHighlightColor_Friendly */ [0, 0.46, 0.1, 0.42],
		[d]: /* legalMovesHighlightColor_Opponent */ [1, 0.18, 0.24, 0.46],
		[e]: /* legalMovesHighlightColor_Premove */ [0, 0, 0.38, 0.30],
	},
	ocean: {
		[a]: /* lightTiles */ [0.42, 0.75, 0.96, 1],
		[b]: /* darkTiles */ [0.25, 0.46, 0.73, 1],
		[c]: /* legalMovesHighlightColor_Friendly */ [0, 0.86, 0.14, 0.5],
		[d]: /* legalMovesHighlightColor_Opponent */ [1, 0, 0.22, 0.35],
		[e]: /* legalMovesHighlightColor_Premove */ [0.12, 0, 0.24, 0.48],
	},
	blue_hard: {
		[a]: /* lightTiles */ [0.84, 0.91, 0.94, 1],
		[b]: /* darkTiles */ [0.26, 0.55, 0.78, 1],
		[c]: /* legalMovesHighlightColor_Friendly */ [0, 0.6, 0.1, 0.46],
		[d]: /* legalMovesHighlightColor_Opponent */ [1, 0, 0.22, 0.37],
		[e]: /* legalMovesHighlightColor_Premove */ [0.12, 0, 0.24, 0.42],
	},
	blue: {
		[a]: /* lightTiles */ [0.87, 0.89, 0.91, 1],
		[b]: /* darkTiles */ [0.55, 0.64, 0.68, 1],
		[c]: /* legalMovesHighlightColor_Friendly */ [0, 0.60, 0.1, 0.34],
		[d]: /* legalMovesHighlightColor_Opponent */ [1, 0.46, 0, 0.35],
		[e]: /* legalMovesHighlightColor_Premove */ [0, 0, 0.38, 0.34],
		[f]: /* lastMoveHighlightColor */ [0, 1, 1, 0.3],
	},
	blue_soft: {
		[a]: /* lightTiles */ [0.59, 0.70, 0.78, 1],
		[b]: /* darkTiles */ [0.45, 0.55, 0.62, 1],
		[c]: /* legalMovesHighlightColor_Friendly */ [0, 0.60, 0.1, 0.36],
		[d]: /* legalMovesHighlightColor_Opponent */ [1, 0.46, 0, 0.37],
		[e]: /* legalMovesHighlightColor_Premove */ [0, 0, 0.38, 0.36],
	},
	green_plastic: {
		[a]: /* lightTiles */ [0.95, 0.98, 0.73, 1],
		[b]: /* darkTiles */ [0.35, 0.58, 0.36, 1],
		[c]: /* legalMovesHighlightColor_Friendly */ [0, 0.26, 0.64, 0.56],
		[d]: /* legalMovesHighlightColor_Opponent */ [1, 0.18, 0, 0.43],
		[e]: /* legalMovesHighlightColor_Premove */ [0, 0, 0.38, 0.40],
	},
	green: { 
		[a]: /* lightTiles */ [0.92, 0.93, 0.82, 1],
		[b]: /* darkTiles */ [0.45, 0.58, 0.32, 1],
		[c]: /* legalMovesHighlightColor_Friendly */ [1, 1, 0, 0.48],
		[d]: /* legalMovesHighlightColor_Opponent */ [0.28, 0, 1, 0.31],
		[e]: /* legalMovesHighlightColor_Premove */ [1, 0.12, 0.12, 0.38],
		[f]: /* lastMoveHighlightColor */ [1, 1, 0, 0.4],
	},
	lime: {
		[a]: /* lightTiles */ [0.8, 0.94, 0.39, 1],
		[b]: /* darkTiles */ [0.39, 0.71, 0.06, 1],
		[c]: /* legalMovesHighlightColor_Friendly */ [0, 0.26, 0.48, 0.52],
		[d]: /* legalMovesHighlightColor_Opponent */ [1, 0, 0, 0.35],
		[e]: /* legalMovesHighlightColor_Premove */ [0, 0, 0.30, 0.34],
		[f]: /* lastMoveHighlightColor */ [0, 0.26, 1, 0.24],
	},
	avocado: {
		[a]: /* lightTiles */ [0.84, 0.98, 0.5, 1],
		[b]: /* darkTiles */ [0.62, 0.77, 0.35, 1],
		[c]: /* legalMovesHighlightColor_Friendly */ [0, 0.26, 0.48, 0.4],
		[d]: /* legalMovesHighlightColor_Opponent */ [1, 0, 0, 0.31],
		[e]: /* legalMovesHighlightColor_Premove */ [0, 0, 0.30, 0.30],
		[f]: /* lastMoveHighlightColor */ [0, 0.28, 1, 0.24],
	},
	white: {
		[a]: /* lightTiles */ [1, 1, 1, 1],
		[b]: /* darkTiles */  [0.78, 0.78, 0.78, 1],
		[c]: /* legalMovesHighlightColor_Friendly */ [0, 0, 1, 0.28],
		[d]: /* legalMovesHighlightColor_Opponent */ [1, 0.72, 0, 0.37],
		[e]: /* legalMovesHighlightColor_Premove */ [0, 0, 0.26, 0.36],
		[f]: /* lastMoveHighlightColor */ [0.28, 1, 0, 0.28],
	},
	poison: {
		[a]: /* lightTiles */ [0.93, 0.93, 0.93, 1],
		[b]: /* darkTiles */ [0.76, 0.76, 0.56, 1],
		[c]: /* legalMovesHighlightColor_Friendly */ [0, 0.48, 0.1, 0.32],
		[d]: /* legalMovesHighlightColor_Opponent */ [1, 0.18, 0, 0.29],
		[e]: /* legalMovesHighlightColor_Premove */ [0, 0, 0.38, 0.28],
	},
	grey: {
		[a]: /* lightTiles */ [0.72, 0.72, 0.72, 1],
		[b]: /* darkTiles */ [0.55, 0.55, 0.55, 1], // tad darker than lichess
		[c]: /* legalMovesHighlightColor_Friendly */ [0, 0.48, 0.1, 0.32],
		[d]: /* legalMovesHighlightColor_Opponent */ [1, 0.18, 0, 0.27],
		[e]: /* legalMovesHighlightColor_Premove */ [0, 0, 0.38, 0.26],
	},
	olive: {
		[a]: /* lightTiles */ [0.71, 0.68, 0.62, 1],
		[b]: /* darkTiles */ [0.55, 0.51, 0.45, 1],
		[c]: /* legalMovesHighlightColor_Friendly */ [0, 0.48, 0.1, 0.34],
		[d]: /* legalMovesHighlightColor_Opponent */ [1, 0.18, 0, 0.29],
		[e]: /* legalMovesHighlightColor_Premove */ [0, 0, 0.38, 0.28],
	},
	dark_grey: {
		[a]: /* lightTiles */ [0.45, 0.45, 0.45, 1],
		[b]: /* darkTiles */ [0.3, 0.3, 0.3, 1],
		[c]: /* legalMovesHighlightColor_Friendly */ [0, 0.58, 0.1, 0.34],
		[d]: /* legalMovesHighlightColor_Opponent */ [1, 0.18, 0, 0.31],
		[e]: /* legalMovesHighlightColor_Premove */ [0, 0, 0.40, 0.26],
	},
	seabed: {
		[a]: /* lightTiles */ [0.56, 0.66, 0.57, 1],
		[b]: /* darkTiles */ [0.42, 0.51, 0.42, 1],
		[c]: /* legalMovesHighlightColor_Friendly */ [0, 0.20, 0.78, 0.32],
		[d]: /* legalMovesHighlightColor_Opponent */ [1, 0.18, 0, 0.29],
		[e]: /* legalMovesHighlightColor_Premove */ [0, 0, 0.28, 0.28],
	},
	marble: { 
		[a]: /* lightTiles */ [0.78, 0.78, 0.7, 1],
		[b]: /* darkTiles */ [0.44, 0.42, 0.4, 1],
		[c]: /* legalMovesHighlightColor_Friendly */ [0, 0.48, 0.1, 0.44],
		[d]: /* legalMovesHighlightColor_Opponent */ [1, 0.18, 0, 0.37],
		[e]: /* legalMovesHighlightColor_Premove */ [0, 0, 0.38, 0.34],
	},
	purple: {
		[a]: /* lightTiles */ [0.93, 0.89, 0.96, 1],
		[b]: /* darkTiles */ [0.59, 0.49, 0.7, 1],
		[c]: /* legalMovesHighlightColor_Friendly */ [0, 0.48, 0.1, 0.44],
		[d]: /* legalMovesHighlightColor_Opponent */ [1, 0.18, 0, 0.39],
		[e]: /* legalMovesHighlightColor_Premove */ [0, 0, 0.30, 0.42],
	},
	pink: {
		[a]: /* lightTiles */ [0.98, 0.93, 0.93, 1],
		[b]: /* darkTiles */ [0.95, 0.76, 0.76, 1],
		[c]: /* legalMovesHighlightColor_Friendly */ [0, 0.48, 0.1, 0.32],
		[d]: /* legalMovesHighlightColor_Opponent */ [1, 0.18, 0, 0.29],
		[e]: /* legalMovesHighlightColor_Premove */ [0, 0, 0.38, 0.28],
	},
	beehive: {
		[a]: /* lightTiles */ [1, 0.86, 0.35, 1],
		[b]: /* darkTiles */ [0.88, 0.52, 0.05, 1],
		[c]: /* legalMovesHighlightColor_Friendly */ [0, 0.48, 0.1, 0.44],
		[d]: /* legalMovesHighlightColor_Opponent */ [1, 0.14, 0, 0.49],
		[e]: /* legalMovesHighlightColor_Premove */ [0, 0, 0.38, 0.32],
		[f]: /* lastMoveHighlightColor */ [0, 1, 0, 0.28],
	},

	// purple_hard: { 
	// 	[a]: /* lightTiles */ [0.95, 0.95, 0.95, 1],
	// 	[b]: /* darkTiles */ [0.49, 0.42, 0.68, 1],
	// },

	// Holiday themes

	// halloween: {
	// 	[a]: /* lightTiles */ [1, 0.65, 0.4, 1],
	// 	[b]: /* darkTiles */  [1, 0.4, 0, 1],
	// 	[c]: /* legalMovesHighlightColor_Friendly */ [0.6, 0, 1, 0.55],
	// 	[d]: /* legalMovesHighlightColor_Opponent */ [0, 0.5, 0, 0.35],
	// 	[e]: /* legalMovesHighlightColor_Premove */ [1, 0.15, 0, 0.65],
	// 	[f]: /* lastMoveHighlightColor */ [0.5, 0.2, 0, 0.75],
	// 	[g]: /* checkHighlightColor */ [1, 0, 0.5, 0.76],
	// 	useColoredPieces: true,
	// 	whitePiecesColor: [0.6, 0.5, 0.45, 1],
	// 	blackPiecesColor: [0.8, 0, 1, 1],
	// 	neutralPiecesColor: [1, 1, 1, 1],
	// },
	// christmas: {
	// 	[a]: /* lightTiles */ [0.60, 0.93, 1, 1],
	// 	[b]: /* darkTiles */ [0 / 255, 199 / 255, 238 / 255, 1],
	// 	[c]: /* legalMovesHighlightColor_Friendly */ [0, 0, 1, 0.35],
	// 	[d]: /* legalMovesHighlightColor_Opponent */ [1, 0.7, 0, 0.35],
	// 	[e]: /* legalMovesHighlightColor_Premove */ [0.25, 0, 0.7, 0.3],
	// 	[f]: /* lastMoveHighlightColor */ [0, 0, 0.3, 0.35],
	// 	[g]: /* checkHighlightColor */ [1, 0, 0, 0.7],
	// 	useColoredPieces: true,
	// 	whitePiecesColor: [0.4, 1, 0.4, 1],
	// 	blackPiecesColor: [1, 0.2, 0.2, 1],
	// 	neutralPiecesColor: [1, 1, 1, 1],
	// }
};

/**
 * Returns the specified property of the provided theme.
 * @param {string} themeName - e.g. "sandstone"
 * @param {string} property - e.g. "legalMoveHighlightColor_Friendly"
 * @returns {Object} - The property of the theme
 */
function getPropertyOfTheme(themeName, property) {
	return themeDictionary[themeName][property] !== undefined ? themeDictionary[themeName][property] : defaults[property];
}

function isThemeValid(themeName) {
	if (typeof themeName !== 'string') return false;
	return themeDictionary[themeName] !== undefined;
}

export default {
	defaultTheme,
	themes: themeDictionary,
	getPropertyOfTheme,
	isThemeValid,
};