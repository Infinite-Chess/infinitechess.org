// src/shared/components/header/themes.ts

/**
 * The board color themes the user may pick between, and the fallback values a
 * theme inherits for any property it doesn't set itself.
 */

import type { Color } from '../../util/math/math.js';
import type { PieceColorGroup } from '../../chess/util/pieceThemes.js';

import jsutil from '../../util/jsutil.js';

// Property Name Aliases -------------------------------------------------------

/*
 * Each alias holds the property name it is named after. Referencing the themes'
 * keys through them as computed property names greatly compacts this script,
 * since the bundler shortens each symbol to a single letter.
 */
const lightTiles = 'lightTiles';
const darkTiles = 'darkTiles';
const legalMovesHighlightColor_Friendly = 'legalMovesHighlightColor_Friendly';
const legalMovesHighlightColor_Opponent = 'legalMovesHighlightColor_Opponent';
const legalMovesHighlightColor_Premove = 'legalMovesHighlightColor_Premove';
const lastMoveHighlightColor = 'lastMoveHighlightColor';
const checkHighlightColor = 'checkHighlightColor';
const boxOutlineColor = 'boxOutlineColor';
const annoteSquareColor = 'annoteSquareColor';
const annoteArrowColor = 'annoteArrowColor';
const pieceTheme = 'pieceTheme';

// Types -----------------------------------------------------------------------

/** Every theme property, and the type of value it holds. */
interface ThemeProperties {
	[lightTiles]: Color;
	[darkTiles]: Color;
	[legalMovesHighlightColor_Friendly]: Color;
	[legalMovesHighlightColor_Opponent]: Color;
	[legalMovesHighlightColor_Premove]: Color;
	[lastMoveHighlightColor]: Color;
	[checkHighlightColor]: Color;
	[boxOutlineColor]: Color;
	[annoteSquareColor]: Color;
	[annoteArrowColor]: Color;
	[pieceTheme]: Partial<PieceColorGroup>;
}

/** What a theme is, and the properties it may override. */
interface Theme extends Partial<ThemeProperties> {
	[lightTiles]: Color;
	[darkTiles]: Color;
	[legalMovesHighlightColor_Friendly]: Color;
	[legalMovesHighlightColor_Opponent]: Color;
	[legalMovesHighlightColor_Premove]: Color;
}

// Constants -------------------------------------------------------------------

/**
 * The values a theme inherits for every property it does not set itself.
 *
 * The board colors are deliberately garish — no theme omits them, so they only
 * ever surface as a bug signal if the user's stored theme name isn't one we recognize.
 */
const DEFAULTS: ThemeProperties = {
	[lightTiles]: [1, 0, 1, 1],
	[darkTiles]: [0, 0, 0, 1],
	[legalMovesHighlightColor_Friendly]: [1, 0, 1, 0.5],
	[legalMovesHighlightColor_Opponent]: [1, 0, 1, 0.5],
	[legalMovesHighlightColor_Premove]: [1, 0, 1, 0.5],
	[lastMoveHighlightColor]: [0.72, 1, 0, 0.28],
	[checkHighlightColor]: [1, 0, 0, 0.7],
	[boxOutlineColor]: [1, 1, 1, 0.45],
	[annoteSquareColor]: [1, 0, 0, 0.35], // .43 with no .08 offset to squares.   This matches the Ray color exactly, though
	[annoteArrowColor]: [1, 0.65, 0.15, 0.8],
	[pieceTheme]: {},
};

/** The theme a user is given until they pick another. */
const DEFAULT_THEME = 'wood_light';

/** Every selectable theme, keyed by the name the user picks it by. */
const THEMES: { [themeName: string]: Theme } = {
	wood_light: {
		// 5D Chess
		[lightTiles]: [1, 0.85, 0.66, 1],
		[darkTiles]: [0.87, 0.68, 0.46, 1],
		[legalMovesHighlightColor_Friendly]: [0, 0.5, 0.14, 0.38],
		[legalMovesHighlightColor_Opponent]: [1, 0.18, 0, 0.37],
		[legalMovesHighlightColor_Premove]: [0, 0, 0.38, 0.32],
		[lastMoveHighlightColor]: [0.9, 1, 0, 0.3],
		// [annoteSquareColor]: [1, 0, 0, 0.35], // .43 with no .08 offset to squares
		// [annoteArrowColor]: [1, 0.65, 0.15, 0.8],
	},
	sandstone: {
		// Sometimes thanksgiving uses this
		[lightTiles]: [0.94, 0.88, 0.78, 1],
		[darkTiles]: [0.74, 0.63, 0.53, 1],
		[legalMovesHighlightColor_Friendly]: [1, 0.2, 0, 0.35], // 0.5 for BIG positions   0.35 for SMALL
		[legalMovesHighlightColor_Opponent]: [1, 0.7, 0, 0.35],
		[legalMovesHighlightColor_Premove]: [0, 0, 0.38, 0.28],
		[lastMoveHighlightColor]: [0.3, 1, 0, 0.35], // 0.3 for small, 0.35 for BIG positions
	},
	wood: {
		[lightTiles]: [0.96, 0.87, 0.75, 1],
		[darkTiles]: [0.71, 0.54, 0.38, 1],
		[legalMovesHighlightColor_Friendly]: [0, 0.48, 0.1, 0.42],
		[legalMovesHighlightColor_Opponent]: [1, 0.18, 0, 0.43],
		[legalMovesHighlightColor_Premove]: [0, 0, 0.38, 0.32],
	},
	sandstone_dark: {
		[lightTiles]: [0.86, 0.76, 0.5, 1],
		[darkTiles]: [0.69, 0.55, 0.35, 1],
		[legalMovesHighlightColor_Friendly]: [0, 0.48, 0.1, 0.32],
		[legalMovesHighlightColor_Opponent]: [1, 0.18, 0, 0.29],
		[legalMovesHighlightColor_Premove]: [0, 0, 0.38, 0.28],
	},
	maple: {
		[lightTiles]: [0.96, 0.81, 0.65, 1],
		[darkTiles]: [0.83, 0.52, 0.32, 1],
		[legalMovesHighlightColor_Friendly]: [0, 0.48, 0.1, 0.32],
		[legalMovesHighlightColor_Opponent]: [1, 0.52, 0, 0.57],
		[legalMovesHighlightColor_Premove]: [0, 0, 0.38, 0.28],
	},
	red_wood: {
		[lightTiles]: [0.96, 0.82, 0.7, 1],
		[darkTiles]: [0.76, 0.35, 0.24, 1],
		[legalMovesHighlightColor_Friendly]: [0, 0.48, 0.1, 0.48],
		[legalMovesHighlightColor_Opponent]: [1, 0.52, 0, 0.61],
		[legalMovesHighlightColor_Premove]: [0, 0, 0.38, 0.36],
	},
	cyan_ocean: {
		[lightTiles]: [0.06, 1, 1, 1],
		[darkTiles]: [0.18, 0.76, 0.78, 1],
		[legalMovesHighlightColor_Friendly]: [0, 0.46, 0.1, 0.42],
		[legalMovesHighlightColor_Opponent]: [1, 0.18, 0.24, 0.46],
		[legalMovesHighlightColor_Premove]: [0, 0, 0.38, 0.3],
		[annoteSquareColor]: [0, 0, 1, 0.29],
		[annoteArrowColor]: [0.66, 0, 1, 0.62],
	},
	ocean: {
		[lightTiles]: [0.42, 0.75, 0.96, 1],
		[darkTiles]: [0.25, 0.46, 0.73, 1],
		[legalMovesHighlightColor_Friendly]: [0, 0.86, 0.14, 0.5],
		[legalMovesHighlightColor_Opponent]: [1, 0, 0.22, 0.35],
		[legalMovesHighlightColor_Premove]: [0.12, 0, 0.24, 0.48],
	},
	blue_hard: {
		[lightTiles]: [0.84, 0.91, 0.94, 1],
		[darkTiles]: [0.26, 0.55, 0.78, 1],
		[legalMovesHighlightColor_Friendly]: [0, 0.6, 0.1, 0.46],
		[legalMovesHighlightColor_Opponent]: [1, 0, 0.22, 0.37],
		[legalMovesHighlightColor_Premove]: [0.12, 0, 0.24, 0.42],
	},
	blue: {
		[lightTiles]: [0.87, 0.89, 0.91, 1],
		[darkTiles]: [0.55, 0.64, 0.68, 1],
		[legalMovesHighlightColor_Friendly]: [0, 0.6, 0.1, 0.34],
		[legalMovesHighlightColor_Opponent]: [1, 0.46, 0, 0.35],
		[legalMovesHighlightColor_Premove]: [0, 0, 0.38, 0.34],
		[lastMoveHighlightColor]: [0, 1, 1, 0.3],
	},
	blue_soft: {
		[lightTiles]: [0.59, 0.7, 0.78, 1],
		[darkTiles]: [0.45, 0.55, 0.62, 1],
		[legalMovesHighlightColor_Friendly]: [0, 0.6, 0.1, 0.36],
		[legalMovesHighlightColor_Opponent]: [1, 0.46, 0, 0.37],
		[legalMovesHighlightColor_Premove]: [0, 0, 0.38, 0.36],
	},
	green_plastic: {
		[lightTiles]: [0.95, 0.98, 0.73, 1],
		[darkTiles]: [0.35, 0.58, 0.36, 1],
		[legalMovesHighlightColor_Friendly]: [0, 0.26, 0.64, 0.56],
		[legalMovesHighlightColor_Opponent]: [1, 0.18, 0, 0.43],
		[legalMovesHighlightColor_Premove]: [0, 0, 0.38, 0.4],
	},
	green: {
		[lightTiles]: [0.92, 0.93, 0.82, 1],
		[darkTiles]: [0.45, 0.58, 0.32, 1],
		[legalMovesHighlightColor_Friendly]: [1, 1, 0, 0.48],
		[legalMovesHighlightColor_Opponent]: [0.28, 0, 1, 0.31],
		[legalMovesHighlightColor_Premove]: [1, 0.12, 0.12, 0.38],
		[lastMoveHighlightColor]: [1, 1, 0, 0.4],
	},
	lime: {
		[lightTiles]: [0.8, 0.94, 0.39, 1],
		[darkTiles]: [0.39, 0.71, 0.06, 1],
		[legalMovesHighlightColor_Friendly]: [0, 0.26, 0.48, 0.52],
		[legalMovesHighlightColor_Opponent]: [1, 0, 0, 0.35],
		[legalMovesHighlightColor_Premove]: [0, 0, 0.3, 0.34],
		[lastMoveHighlightColor]: [0, 0.26, 1, 0.24],
	},
	avocado: {
		[lightTiles]: [0.84, 0.98, 0.5, 1],
		[darkTiles]: [0.62, 0.77, 0.35, 1],
		[legalMovesHighlightColor_Friendly]: [0, 0.26, 0.48, 0.4],
		[legalMovesHighlightColor_Opponent]: [1, 0, 0, 0.31],
		[legalMovesHighlightColor_Premove]: [0, 0, 0.3, 0.3],
		[lastMoveHighlightColor]: [0, 0.28, 1, 0.24],
	},
	white: {
		[lightTiles]: [1, 1, 1, 1],
		[darkTiles]: [0.78, 0.78, 0.78, 1],
		[legalMovesHighlightColor_Friendly]: [0, 0, 1, 0.28],
		[legalMovesHighlightColor_Opponent]: [1, 0.72, 0, 0.37],
		[legalMovesHighlightColor_Premove]: [0, 0, 0.26, 0.36],
		[lastMoveHighlightColor]: [0.28, 1, 0, 0.28],
		[boxOutlineColor]: [0, 0, 0, 0.25],
	},
	poison: {
		[lightTiles]: [0.93, 0.93, 0.93, 1],
		[darkTiles]: [0.76, 0.76, 0.56, 1],
		[legalMovesHighlightColor_Friendly]: [0, 0.48, 0.1, 0.32],
		[legalMovesHighlightColor_Opponent]: [1, 0.18, 0, 0.29],
		[legalMovesHighlightColor_Premove]: [0, 0, 0.38, 0.28],
	},
	grey: {
		[lightTiles]: [0.72, 0.72, 0.72, 1],
		[darkTiles]: [0.55, 0.55, 0.55, 1], // tad darker than lichess
		[legalMovesHighlightColor_Friendly]: [0, 0.48, 0.1, 0.32],
		[legalMovesHighlightColor_Opponent]: [1, 0.18, 0, 0.27],
		[legalMovesHighlightColor_Premove]: [0, 0, 0.38, 0.26],
	},
	olive: {
		[lightTiles]: [0.71, 0.68, 0.62, 1],
		[darkTiles]: [0.55, 0.51, 0.45, 1],
		[legalMovesHighlightColor_Friendly]: [0, 0.48, 0.1, 0.34],
		[legalMovesHighlightColor_Opponent]: [1, 0.18, 0, 0.29],
		[legalMovesHighlightColor_Premove]: [0, 0, 0.38, 0.28],
	},
	dark_grey: {
		[lightTiles]: [0.45, 0.45, 0.45, 1],
		[darkTiles]: [0.3, 0.3, 0.3, 1],
		[legalMovesHighlightColor_Friendly]: [0, 0.58, 0.1, 0.34],
		[legalMovesHighlightColor_Opponent]: [1, 0.18, 0, 0.31],
		[legalMovesHighlightColor_Premove]: [0, 0, 0.4, 0.26],
	},
	seabed: {
		[lightTiles]: [0.56, 0.66, 0.57, 1],
		[darkTiles]: [0.42, 0.51, 0.42, 1],
		[legalMovesHighlightColor_Friendly]: [0, 0.2, 0.78, 0.32],
		[legalMovesHighlightColor_Opponent]: [1, 0.18, 0, 0.29],
		[legalMovesHighlightColor_Premove]: [0, 0, 0.28, 0.28],
	},
	marble: {
		[lightTiles]: [0.78, 0.78, 0.7, 1],
		[darkTiles]: [0.44, 0.42, 0.4, 1],
		[legalMovesHighlightColor_Friendly]: [0, 0.48, 0.1, 0.44],
		[legalMovesHighlightColor_Opponent]: [1, 0.18, 0, 0.37],
		[legalMovesHighlightColor_Premove]: [0, 0, 0.38, 0.34],
	},
	purple: {
		[lightTiles]: [0.93, 0.89, 0.96, 1],
		[darkTiles]: [0.59, 0.49, 0.7, 1],
		[legalMovesHighlightColor_Friendly]: [0, 0.48, 0.1, 0.44],
		[legalMovesHighlightColor_Opponent]: [1, 0.18, 0, 0.39],
		[legalMovesHighlightColor_Premove]: [0, 0, 0.3, 0.42],
	},
	pink: {
		[lightTiles]: [0.98, 0.93, 0.93, 1],
		[darkTiles]: [0.95, 0.76, 0.76, 1],
		[legalMovesHighlightColor_Friendly]: [0, 0.48, 0.1, 0.32],
		[legalMovesHighlightColor_Opponent]: [1, 0.18, 0, 0.29],
		[legalMovesHighlightColor_Premove]: [0, 0, 0.38, 0.28],
	},
	beehive: {
		[lightTiles]: [1, 0.86, 0.35, 1],
		[darkTiles]: [0.88, 0.52, 0.05, 1],
		[legalMovesHighlightColor_Friendly]: [0, 0.48, 0.1, 0.44],
		[legalMovesHighlightColor_Opponent]: [1, 0.14, 0, 0.49],
		[legalMovesHighlightColor_Premove]: [0, 0, 0.38, 0.32],
		[lastMoveHighlightColor]: [0, 1, 0, 0.28],
	},

	// purple_hard: {
	// 	[a]: [0.95, 0.95, 0.95, 1],
	// 	[b]: [0.49, 0.42, 0.68, 1],
	// },

	// Holiday themes

	// halloween: {
	// 	[lightTiles]: [1, 0.65, 0.4, 1],
	// 	[darkTiles]: [1, 0.4, 0, 1],
	// 	[legalMovesHighlightColor_Friendly]: [0.6, 0, 1, 0.55],
	// 	[legalMovesHighlightColor_Opponent]: [0, 0.5, 0, 0.35],
	// 	[legalMovesHighlightColor_Premove]: [1, 0.15, 0, 0.65],
	// 	[lastMoveHighlightColor]: [0.5, 0.2, 0, 0.75],
	// 	[checkHighlightColor]: /* checkHighlightColor */ [1, 0, 0.5, 0.76],
	// 	[pieceTheme]: {
	// 		[players.WHITE]: [0.6, 0.5, 0.45, 1],
	// 		[players.BLACK]: [0.8, 0, 1, 1],
	// 	},
	// },
	// christmas: {
	// 	[lightTiles]: [0.60, 0.93, 1, 1],
	// 	[darkTiles]: [0 / 255, 199 / 255, 238 / 255, 1],
	// 	[legalMovesHighlightColor_Friendly]: [0, 0, 1, 0.35],
	// 	[legalMovesHighlightColor_Opponent]: [1, 0.7, 0, 0.35],
	// 	[legalMovesHighlightColor_Premove]: [0.25, 0, 0.7, 0.3],
	// 	[lastMoveHighlightColor]: [0, 0, 0.3, 0.35],
	// 	[checkHighlightColor]: /* checkHighlightColor */ [1, 0, 0, 0.7],
	// 	[pieceTheme]: {
	// 		[players.WHITE]: [0.4, 1, 0.4, 1],
	// 		[players.BLACK]: [1, 0.2, 0.2, 1],
	// 	},
	// }
};

// Functions -------------------------------------------------------------------

/** Returns a theme's property, falling back to {@link DEFAULTS}. Deep-copied, so callers may mutate it. */
function getPropertyOfTheme<P extends keyof ThemeProperties>(
	themeName: string,
	property: P,
): ThemeProperties[P] {
	const theme: Partial<ThemeProperties> | undefined = THEMES[themeName];
	const value: ThemeProperties[P] = theme?.[property] ?? DEFAULTS[property];
	return jsutil.deepCopyObject(value);
}

/** Whether a theme by that name exists. */
function isThemeValid(themeName: string): boolean {
	return THEMES[themeName] !== undefined;
}

// Exports ---------------------------------------------------------------------

export default {
	// Constants
	DEFAULT_THEME,
	THEMES,
	// Functions
	getPropertyOfTheme,
	isThemeValid,
};
