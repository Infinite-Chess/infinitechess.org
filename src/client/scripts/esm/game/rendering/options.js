
// Import Start
import input from '../input.js';
import onlinegame from '../misc/onlinegame.js';
import highlights from './highlights.js';
import stats from '../gui/stats.js';
import perspective from './perspective.js';
import guinavigation from '../gui/guinavigation.js';
import selection from '../chess/selection.js';
import piecesmodel from './piecesmodel.js';
import camera from './camera.js';
import board from './board.js';
import game from '../chess/game.js';
import statustext from '../gui/statustext.js';
import guigameinfo from '../gui/guigameinfo.js';
import colorutil from '../misc/colorutil.js';
import frametracker from './frametracker.js';
import timeutil from '../misc/timeutil.js';
// Import End

"use strict";

/**
 * This script contains adjustable options such as
 * *Board color
 * *Highlight color
 * etc
 */

// When enabled, your view is expanded to show what you normally can't see beyond the edge of the screen.
// Useful for making sure rendering methods are as expected.
let debugMode = false; // Must be toggled by calling toggleDeveloperMode()

let navigationVisible = true;

let theme = {
	name: 'default',
	whiteTiles: [1, 1, 1, 1],
	darkTiles:  [0.78, 0.78, 0.78, 1],
	selectedPieceHighlightColor: [0, 0.5, 0.5, 0.3],
	legalMovesHighlightColor_Friendly: [0, 0, 1, 0.3],
	legalMovesHighlightColor_Opponent: [1, 0.7, 0, 0.35],
	legalMovesHighlightColor_Premove: [0.3, 0, 1, 0.3],
	lastMoveHighlightColor: [0, 1, 0, 0.25],
	checkHighlightColor: [1, 0, 0, 0.7],
	useColoredPieces: false,
	whitePiecesColor: [1, 1, 1, 1],
	blackPiecesColor: [1, 1, 1, 1],
	neutralPiecesColor: [1, 1, 1, 1]
};
const validThemes = ['default', 'halloween', 'thanksgiving', 'christmas'];

const themes = {
	default: { // White/Grey
		whiteTiles: [1, 1, 1, 1], // RGBA
		darkTiles:  [0.78, 0.78, 0.78, 1],
		// Sandstone Color
		// whiteTiles: [239/255,225/255,199/255,1],
		// darkTiles: [188/255,160/255,136/255,1],
		// Wood Color
		// whiteTiles: [246/255,207/255,167/255,1],
		// darkTiles: [197/255,141/255,88/255,1],
		selectedPieceHighlightColor: [0, 0.5, 0.5, 0.3],
		// selectedPieceHighlightColor: [1, 1, 0,  0.25], // Yellow (for wood theme)
		legalMovesHighlightColor_Friendly: [0, 0, 1, 0.3],
		// legalMovesHighlightColor_Friendly: [1, 0.4, 0,  0.35], // Orange (for sandstone theme)
		// legalMovesHighlightColor_Friendly: [1, 0.2, 0,  0.4], // Red-orange (for wood theme)   0.5 for BIG positions   0.35 for SMALL
		legalMovesHighlightColor_Opponent: [1, 0.7, 0, 0.35],
		legalMovesHighlightColor_Premove: [0.3, 0, 1, 0.3],
		lastMoveHighlightColor: [0, 1, 0, 0.25], // 0.17
		// lastMoveHighlightColor: [0.3, 1, 0,  0.35], // For sandstone theme   0.3 for small, 0.35 for BIG positions
		checkHighlightColor: [1, 0, 0, 0.7],
		// If this is true, we will render them white,
		// utilizing the more efficient color-less shader program!
		useColoredPieces: false,
		whitePiecesColor: [1, 1, 1, 1],
		blackPiecesColor: [1, 1, 1, 1],
		neutralPiecesColor: [1, 1, 1, 1]
	},
	halloween: {
		whiteTiles: [1, 0.65, 0.4, 1], // RGBA
		darkTiles:  [1, 0.4, 0, 1],
		selectedPieceHighlightColor: [0, 0, 0, 0.5],
		legalMovesHighlightColor_Friendly: [0.6, 0, 1, 0.55],
		legalMovesHighlightColor_Opponent: [0, 0.5, 0, 0.35],
		legalMovesHighlightColor_Premove: [1, 0.15, 0, 0.65],
		lastMoveHighlightColor: [0.5, 0.2, 0, 0.75],
		checkHighlightColor: [1, 0, 0.5, 0.76],
		useColoredPieces: true,
		whitePiecesColor: [0.6, 0.5, 0.45, 1],
		blackPiecesColor: [0.8, 0, 1, 1],
		neutralPiecesColor: [1, 1, 1, 1]
	},
	thanksgiving: {
		// Sandstone Color
		whiteTiles: [239 / 255,225 / 255,199 / 255,1],
		darkTiles: [188 / 255,160 / 255,136 / 255,1],
		selectedPieceHighlightColor: [0, 0.5, 0.5, 0.3],
		legalMovesHighlightColor_Friendly: [1, 0.2, 0, 0.35], // Red-orange (for wood theme)   0.5 for BIG positions   0.35 for SMALL
		legalMovesHighlightColor_Opponent: [1, 0.7, 0, 0.35],
		legalMovesHighlightColor_Premove: [0.25, 0, 0.7, 0.3],
		lastMoveHighlightColor: [0.3, 1, 0, 0.35], // For sandstone theme   0.3 for small, 0.35 for BIG positions
		checkHighlightColor: [1, 0, 0, 0.7],
		useColoredPieces: false,
		whitePiecesColor: [1, 1, 1, 1],
		blackPiecesColor: [1, 1, 1, 1],
		neutralPiecesColor: [1, 1, 1, 1]
	},
	christmas: {
		// Sandstone Color
		whiteTiles: [152 / 255, 238 / 255, 255 / 255, 1],
		darkTiles: [0 / 255, 199 / 255, 238 / 255, 1],
		selectedPieceHighlightColor: [0, 0.5, 0.5, 0.3],
		legalMovesHighlightColor_Friendly: [0, 0, 1, 0.35], // Red-orange (for wood theme)   0.5 for BIG positions   0.35 for SMALL
		legalMovesHighlightColor_Opponent: [1, 0.7, 0, 0.35],
		legalMovesHighlightColor_Premove: [0.25, 0, 0.7, 0.3],
		lastMoveHighlightColor: [0, 0, 0.3, 0.35], // For sandstone theme   0.3 for small, 0.35 for BIG positions
		checkHighlightColor: [1, 0, 0, 0.7],
		useColoredPieces: true,
		whitePiecesColor: [0.4, 1, 0.4, 1],
		blackPiecesColor: [1, 0.2, 0.2, 1],
		neutralPiecesColor: [1, 1, 1, 1]
	}
};

let em = false; // editMode, allows moving pieces anywhere else on the board!

let fps = false;


function initThemeChangeListener() {
	document.addEventListener('theme-change', function(event) { // detail: { theme, properties, IMG }
		const selectedTheme = event.detail.theme;
		console.log(`Theme change event detected: ${selectedTheme}`);
		event.detail.properties.name = selectedTheme;
		setTheme(event.detail.properties);
	});
}

initThemeChangeListener();

function isDebugModeOn() {
	return debugMode;
}

function gnavigationVisible() {
	return navigationVisible;
}

function gtheme() {
	return theme;
}

function toggleDeveloperMode() {
	frametracker.onVisualChange(); // Visual change, render the screen this frame
	debugMode = !debugMode;
	camera.onPositionChange();
	perspective.initCrosshairModel();
	piecesmodel.regenModel(game.getGamefile(), getPieceRegenColorArgs()); // This will regenerate the voids model as wireframe
	statustext.showStatus(`${translations.rendering.toggled_debug} ` + (debugMode ? translations.rendering.on : translations.rendering.off));
}

function disableEM() {
	em = false;
}

function getEM() {
	return em;
}

function isFPSOn() {
	return fps;
}

// Toggles EDIT MODE! editMode
// Called when '1' is pressed!
function toggleEM() {

	// Make sure it's legal
	const legalInPrivate = onlinegame.areInOnlineGame() && onlinegame.getIsPrivate() && input.isKeyHeld('0');
	if (onlinegame.areInOnlineGame() && !legalInPrivate) return; // Don't toggle if in an online game

	frametracker.onVisualChange(); // Visual change, render the screen this frame
	em = !em;
	statustext.showStatus(`${translations.rendering.toggled_edit} ` + (em ? translations.rendering.on : translations.rendering.off));
}

/** Toggles the visibility of the navigation bars. */
function setNavigationBar(value) {
	navigationVisible = value;

	onToggleNavigationBar();
}

function toggleNavigationBar() {
	// We should only ever do this if we are in a game!
	if (!game.getGamefile()) return;
	navigationVisible = !navigationVisible;

	onToggleNavigationBar();
}

function onToggleNavigationBar() {
	if (navigationVisible) {
		guinavigation.open();
		guigameinfo.open();
	}
	else guinavigation.close();

	camera.updatePIXEL_HEIGHT_OF_NAVS();
}

function getDefaultTiles(isWhite) {
	if (isWhite) return theme.whiteTiles;
	else return theme.darkTiles;
}

function getLegalMoveHighlightColor({ isOpponentPiece = selection.isOpponentPieceSelected(), isPremove = selection.arePremoving() } = {}) {
	if (isOpponentPiece) return theme.legalMovesHighlightColor_Opponent;
	else if (isPremove) return theme.legalMovesHighlightColor_Premove;
	else return theme.legalMovesHighlightColor_Friendly;
}

function getDefaultSelectedPieceHighlight() {
	return theme.selectedPieceHighlightColor;
}

function getDefaultLastMoveHighlightColor() {
	return theme.lastMoveHighlightColor;
}

function getDefaultCheckHighlightColor() {
	return theme.checkHighlightColor;
}

function setTheme(newTheme) { // default/halloween   
	// if (!validateTheme(theme)) console.error(`Cannot change theme to invalid theme ${theme}!`);
	// if (theme === newTheme) return; // Same theme

	// theme = newTheme;
	// board.updateTheme();
	// piecesmodel.regenModel(game.getGamefile(), getPieceRegenColorArgs());
	// highlights.regenModel();


	theme = newTheme;
	board.updateTheme();
	piecesmodel.regenModel(game.getGamefile(), getPieceRegenColorArgs());
	highlights.regenModel();
}

/**
 * Toggles the theme between 'default' and the auto-selected theme.
 * If the current theme is not 'default', it sets it to 'default'.
 * If the current theme is 'default', it sets it to the value returned by getHollidayTheme().
 */
function toggleHolidayTheme() {
	if (isHollidayTheme(theme)) setTheme('default');
	else setTheme(getHollidayTheme());
}

function isHollidayTheme(themeARG = theme) {
	return themeARG !== 'default';
}

/**
 * Determines the theme based on the current date.
 * @returns {string} The theme for the current date ('halloween', 'christmas', or 'default').
 */
function getHollidayTheme() {
	if (timeutil.isCurrentDateWithinRange(10, 25, 10, 31)) return 'halloween'; // Halloween week (October 25 to 31)
	if (timeutil.isCurrentDateWithinRange(11, 23, 11, 29)) return 'thanksgiving'; // Thanksgiving week (November 23 to 29)
	if (timeutil.isCurrentDateWithinRange(12, 19, 12, 25)) return 'christmas'; // Christmas week (December 19 to 25)
	return 'default'; // Default theme if not in a holiday week
}

function validateTheme(theme) {
	return validThemes.includes(theme);
}

/**
 * Returns the color arrays for the pieces, according to our theme.
 * @returns {Object} An object containing the properties "white", "black", and "neutral".
 */
function getPieceRegenColorArgs() {
	if (!theme.useColoredPieces) return; // Not using colored pieces
    
	return {
		white: theme.whitePiecesColor, // [r,g,b,a]
		black: theme.blackPiecesColor,
		neutral: theme.neutralPiecesColor
	};
}

// Returns { r, g, b, a } depending on our current theme!
function getColorOfType(type) {
	const colorArgs = getPieceRegenColorArgs(); // { white, black, neutral }
	if (!colorArgs) return { r: 1, g: 1, b: 1, a: 1 }; // No theme, return default white.

	const pieceColor = colorutil.getPieceColorFromType(type); // white/black/neutral
	const color = colorArgs[pieceColor]; // [r,g,b,a]

	return {
		r: color[0],
		g: color[1],
		b: color[2],
		a: color[3]
	};
}

// Returns true if our current theme is using custom-colored pieces.
function areUsingColoredPieces() {
	return theme.useColoredPieces;
}

function toggleFPS() {
	fps = !fps;

	if (fps) stats.showFPS();
	else stats.hideFPS();
}

function isThemeDefault() {
	return theme === "default";
}

export default {
	isDebugModeOn,
	gnavigationVisible,
	setNavigationBar,
	gtheme,
	toggleDeveloperMode,
	toggleEM,
	toggleNavigationBar,
	getDefaultTiles,
	getLegalMoveHighlightColor,
	getDefaultSelectedPieceHighlight,
	getDefaultLastMoveHighlightColor,
	getDefaultCheckHighlightColor,
	setTheme,
	toggleHolidayTheme,
	getPieceRegenColorArgs,
	getColorOfType,
	areUsingColoredPieces,
	getEM,
	toggleFPS,
	isThemeDefault,
	disableEM,
	isFPSOn,
	isHollidayTheme,
	initThemeChangeListener,
};