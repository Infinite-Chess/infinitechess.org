import themes from "./themes.js";
import localstorage from "../../util/localstorage.js";
import timeutil from "../../util/timeutil.js";
import validatorama from "../../util/validatorama.js";
import jsutil from "../../util/jsutil.js";
import docutil from "../../util/docutil.js";
import colorutil from "../../chess/util/colorutil.js";


let preferences; // { theme, legal_moves }

// The legal moves shape preference
const default_legal_moves = 'squares'; // dots/squares
const default_drag_enabled = true;
const default_premove_mode = false; // Change this to true when premoves are implemented.
const default_perspective_sensitivity = 100;
const default_perspective_fov = 90;

/** Prefs that do NOT get saved on the server side */
const clientSidePrefs = ['perspective_sensitivity', 'perspective_fov', 'drag_enabled', 'premove_mode'];

/**
 * Whether a change was made to the preferences since the last time we sent them over to the server.
 * We only change this to true if we change a preference that isn't only client side.
 */
let changeWasMade = false;


(function init() {
	loadPreferences();
})();

function loadPreferences() {
	
	const browserStoragePrefs = localstorage.loadItem('preferences') || {
		theme: themes.defaultTheme,
		legal_moves: default_legal_moves,
		perspective_sensitivity: default_perspective_sensitivity,
		perspective_fov: default_perspective_fov,
	};
	preferences = browserStoragePrefs;

	let cookiePrefs = docutil.getCookieValue('preferences');
	if (cookiePrefs) {
		// console.log("Preferences cookie was present!");
		cookiePrefs = JSON.parse(decodeURIComponent(cookiePrefs));
		// console.log(cookiePrefs);
		clientSidePrefs.forEach(pref => { cookiePrefs[pref] = browserStoragePrefs[pref]; });
		preferences = cookiePrefs;
		savePreferences(); // Save preferences for whoever was logged in last into local storage
	}
}

function savePreferences() {
	const oneYearInMillis = timeutil.getTotalMilliseconds({ years: 1 });
	localstorage.saveItem('preferences', preferences, oneYearInMillis);

	// After a delay, also send a post request to the server to update our preferences.
	// Auto send it if the window is closing
}

function onChangeMade() {
	changeWasMade = true;
	validatorama.getAccessToken(); // Preload the access token so that we are ready to quickly save our preferences on the server if the page is unloaded
}

async function sendPrefsToServer() {
	if (!validatorama.areWeLoggedIn()) return;  // Ensure user is logged in
	if (!changeWasMade) return;  // Only send if preferences were changed
	changeWasMade = false;  // Reset the flag after sending

	console.log('Sending preferences to the server!');
	const preparedPrefs = preparePrefs();  // Prepare the preferences to send
	POSTPrefs(preparedPrefs);
}

async function POSTPrefs(preparedPrefs) {
	// Configure the POST request
	const config = {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			"is-fetch-request": "true" // Custom header
		},
		body: JSON.stringify({ preferences: preparedPrefs }),  // Send the preferences as JSON
	};

	// Get the access token and add it to the Authorization header
	const token = await validatorama.getAccessToken();
	if (token) config.headers.Authorization = `Bearer ${token}`;  // If you use tokens for authentication

	try {
		const response = await fetch('/api/set-preferences', config);
		
		// Check if the response status code indicates success (e.g., 200-299 range)
		if (response.ok) {
			console.log('Preferences updated successfully on the server.');
		} else {
			// Handle unsuccessful response
			const errorData = await response.json();
			console.error('Failed to update preferences on the server:', errorData.message || errorData);
		}
	} catch (error) {
		console.error('Error sending preferences to the server:', error);
	}
}

function preparePrefs() {
	const prefsCopy = jsutil.deepCopyObject(preferences);
	Object.keys(prefsCopy).forEach(prefName => {
		if (clientSidePrefs.includes(prefName)) delete prefsCopy[prefName];
	});
	// console.log(`Original preferences: ${JSON.stringify(preferences)}`);
	// console.log(`Prepared preferences: ${JSON.stringify(prefsCopy)}`);
	return prefsCopy;
}


function getTheme() {
	return preferences.theme || themes.defaultTheme;
}
function setTheme(theme) {
	preferences.theme = theme;
	console.log('Set theme')
	onChangeMade();
	savePreferences();
}

function getLegalMovesShape() {
	return preferences.legal_moves || default_legal_moves;
}
function setLegalMovesShape(legal_moves) {
	if (typeof legal_moves !== 'string') throw new Error('Cannot set preference legal_moves when it is not a string.');
	preferences.legal_moves = legal_moves;
	onChangeMade();
	savePreferences();
}

function getDragEnabled() {
	return preferences.drag_enabled ?? default_drag_enabled;
}
function setDragEnabled(drag_enabled) {
	if (typeof drag_enabled !== 'boolean') throw new Error('Cannot set preference drag_enabled when it is not a boolean.');
	preferences.drag_enabled = drag_enabled;
	savePreferences();
}
function getPremoveMode() {
	return preferences.premove_mode ?? default_premove_mode;
}
function setPremoveMode(premove_mode) {
	if (typeof premove_mode !== 'boolean') throw new Error('Cannot set preference premove_mode when it is not a string.');
	preferences.premove_mode = premove_mode;
	savePreferences();
}

function getPerspectiveSensitivity() {
	return preferences.perspective_sensitivity || default_perspective_sensitivity;
}
function setPerspectiveSensitivity(perspective_sensitivity) {
	if (typeof perspective_sensitivity !== 'number') throw new Error('Cannot set preference perspective_sensitivity when it is not a number.');
	preferences.perspective_sensitivity = perspective_sensitivity;
	savePreferences();
}

function getPerspectiveFOV() {
	return preferences.perspective_fov || default_perspective_fov;
}
function getDefaultPerspectiveFOV() {
	return default_perspective_fov;
}
function setPerspectiveFOV(perspective_fov) {
	if (typeof perspective_fov !== 'number') throw new Error('Cannot set preference perspective_fov when it is not a number.');
	preferences.perspective_fov = perspective_fov;
	savePreferences();
	document.dispatchEvent(new CustomEvent('fov-change'));
}


// Getters for our current theme properties --------------------------------------------------------


function getColorOfLightTiles() {
	const themeName = getTheme();
	return themes.getPropertyOfTheme(themeName, 'lightTiles');
}

function getColorOfDarkTiles() {
	const themeName = getTheme();
	return themes.getPropertyOfTheme(themeName, 'darkTiles');
}

function getLegalMoveHighlightColor({ isOpponentPiece = selection.isOpponentPieceSelected(), isPremove = selection.arePremoving() } = {}) {
	const themeName = getTheme();
	if (isOpponentPiece) return themes.getPropertyOfTheme(themeName, 'legalMovesHighlightColor_Opponent');
	else if (isPremove) return themes.getPropertyOfTheme(themeName, 'legalMovesHighlightColor_Premove');
	else return themes.getPropertyOfTheme(themeName, 'legalMovesHighlightColor_Friendly');
}

function getLastMoveHighlightColor() {
	const themeName = getTheme();
	return themes.getPropertyOfTheme(themeName, 'lastMoveHighlightColor');
}

function getCheckHighlightColor() {
	const themeName = getTheme();
	return themes.getPropertyOfTheme(themeName, 'checkHighlightColor'); 
}

function getBoxOutlineColor() {
	const themeName = getTheme();
	return themes.getPropertyOfTheme(themeName, 'boxOutlineColor');
}

/** Returns { r, g, b, a } depending on our current theme! */
function getTintColorOfType(type) {
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

/**
 * Returns the color arrays for the pieces, according to our theme.
 * @returns {Object | undefined} An object containing the properties "white", "black", and "neutral".
 */
function getPieceRegenColorArgs() {
	const themeName = getTheme();
	const themeProperties = themes.themes[themeName];
	if (!themeProperties.useColoredPieces) return; // Not using colored pieces

	return {
		white: themes.getPropertyOfTheme(themeName, 'whitePiecesColor'), // [r,g,b,a]
		black: themes.getPropertyOfTheme(themeName, 'blackPiecesColor'),
		neutral: themes.getPropertyOfTheme(themeName, 'neutralPiecesColor'),
	};
}

// /**
//  * Determines the theme based on the current date.
//  * @returns {string} The theme for the current date ('halloween', 'christmas', or 'default').
//  */
// function getHollidayTheme() {
// 	if (timeutil.isCurrentDateWithinRange(10, 25, 10, 31)) return 'halloween'; // Halloween week (October 25 to 31)
// 	// if (timeutil.isCurrentDateWithinRange(11, 23, 11, 29)) return 'thanksgiving'; // Thanksgiving week (November 23 to 29)
// 	if (timeutil.isCurrentDateWithinRange(12, 19, 12, 25)) return 'christmas'; // Christmas week (December 19 to 25)
// 	return themes.defaultTheme; // Default theme if not in a holiday week
// }


/*
 * The commented stuff below was ONLY used for fast
 * modifying of theme colors using the keyboard keys!!!
 */

// const allProperties = Object.keys(themes.themes[themes.defaultTheme]);
// let currPropertyIndex = 0;
// let currProperty = allProperties[currPropertyIndex];
// function update() {

// 	const themeProperties = themes.themes[theme];
	
// 	if (input.isKeyDown('u')) {
// 		currPropertyIndex--;
// 		if (currPropertyIndex < 0) currPropertyIndex = allProperties.length - 1;
// 		currProperty = allProperties[currPropertyIndex];
// 		console.log(`Selected property: ${currProperty}`);
// 	}
// 	if (input.isKeyDown('i')) {
// 		currPropertyIndex++;
// 		if (currPropertyIndex > allProperties.length - 1) currPropertyIndex = 0;
// 		currProperty = allProperties[currPropertyIndex];
// 		console.log(`Selected property: ${currProperty}`);
// 	}

// 	const amount = 0.02;

// 	if (input.isKeyDown('j')) {
// 		const dig = 0;
// 		themeProperties[currProperty][dig] += amount;
// 		if (themeProperties[currProperty][dig] > 1) themeProperties[currProperty][dig] = 1;
// 		console.log(themeProperties[currProperty]);
// 	}
// 	if (input.isKeyDown('m')) {
// 		const dig = 0;
// 		themeProperties[currProperty][dig] -= amount;
// 		if (themeProperties[currProperty][dig] < 0) themeProperties[currProperty][dig] = 0;
// 		console.log(themeProperties[currProperty]);
// 	}

// 	if (input.isKeyDown('k')) {
// 		const dig = 1;
// 		themeProperties[currProperty][dig] += amount;
// 		if (themeProperties[currProperty][dig] > 1) themeProperties[currProperty][dig] = 1;
// 		console.log(themeProperties[currProperty]);
// 	}
// 	if (input.isKeyDown(',')) {
// 		const dig = 1;
// 		themeProperties[currProperty][dig] -= amount;
// 		if (themeProperties[currProperty][dig] < 0) themeProperties[currProperty][dig] = 0;
// 		console.log(themeProperties[currProperty]);
// 	}

// 	if (input.isKeyDown('l')) {
// 		const dig = 2;
// 		themeProperties[currProperty][dig] += amount;
// 		if (themeProperties[currProperty][dig] > 1) themeProperties[currProperty][dig] = 1;
// 		console.log(themeProperties[currProperty]);
// 	}
// 	if (input.isKeyDown('.')) {
// 		const dig = 2;
// 		themeProperties[currProperty][dig] -= amount;
// 		if (themeProperties[currProperty][dig] < 0) themeProperties[currProperty][dig] = 0;
// 		console.log(themeProperties[currProperty]);
// 	}

// 	if (input.isKeyDown(';')) {
// 		const dig = 3;
// 		themeProperties[currProperty][dig] += amount;
// 		if (themeProperties[currProperty][dig] > 1) themeProperties[currProperty][dig] = 1;
// 		console.log(themeProperties[currProperty]);
// 	}
// 	if (input.isKeyDown('/')) {
// 		const dig = 3;
// 		themeProperties[currProperty][dig] -= amount;
// 		if (themeProperties[currProperty][dig] < 0) themeProperties[currProperty][dig] = 0;
// 		console.log(themeProperties[currProperty]);
// 	}


// 	if (input.isKeyDown('\\')) {
// 		console.log(JSON.stringify(themes.themes[theme]));
// 	}

// 	board.updateTheme();
// 	piecesmodel.regenModel(gameslot.getGamefile());
// 	highlights.regenModel();
// }


// Exports -----------------------------------------------------------------------------------------


export default {
	getTheme,
	setTheme,
	getLegalMovesShape,
	setLegalMovesShape,
	getDragEnabled,
	setDragEnabled,
	getPremoveMode,
	setPremoveMode,
	getPerspectiveSensitivity,
	setPerspectiveSensitivity,
	getPerspectiveFOV,
	getDefaultPerspectiveFOV,
	setPerspectiveFOV,
	sendPrefsToServer,
	getColorOfLightTiles,
	getColorOfDarkTiles,
	getLegalMoveHighlightColor,
	getLastMoveHighlightColor,
	getCheckHighlightColor,
	getBoxOutlineColor,
	getTintColorOfType,
	getPieceRegenColorArgs,
};