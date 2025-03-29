

import themes from "./themes.js";
import pieceThemes, { PieceColorGroup } from "./pieceThemes.js";
import localstorage from "../../util/localstorage.js";
import timeutil from "../../util/timeutil.js";
import validatorama from "../../util/validatorama.js";
import jsutil from "../../util/jsutil.js";
import docutil from "../../util/docutil.js";
import typeutil from "../../chess/util/typeutil.js";


import type { Color } from "../../chess/util/colorutil.js";



// Type Definitions ------------------------------------------------------------


/** Prefs that do NOT get saved on the server side */
const clientSidePrefs: string[] = ['perspective_sensitivity', 'perspective_fov', 'drag_enabled', 'premove_mode'];
interface ClientSidePreferences {
	perspective_sensitivity: number;
	perspective_fov: number;
	drag_enabled: boolean;
	premove_mode: boolean;
	[key: string]: any;
}

interface ServerSidePreferences {
	theme: string;
	legal_moves: 'dots' | 'squares';
}

/** Both client and server side preferences */
type Preferences = ServerSidePreferences & ClientSidePreferences;

// Variables ------------------------------------------------------------


let preferences: Preferences;

// The legal moves shape preference
const default_legal_moves: 'dots' | 'squares' = 'squares'; // dots/squares
const default_drag_enabled: boolean = true;
const default_premove_mode: boolean = false; // Change this to true when premoves are implemented.
const default_perspective_sensitivity: number = 100;
const default_perspective_fov: number = 90;


/**
 * Whether a change was made to the preferences since the last time we sent them over to the server.
 * We only change this to true if we change a preference that isn't only client side.
 */
let changeWasMade: boolean = false;


// Functions -----------------------------------------------------------------------


(function init(): void {
	loadPreferences();
})();

function loadPreferences(): void {
	const browserStoragePrefs: Preferences = localstorage.loadItem('preferences') || {
		theme: themes.defaultTheme,
		legal_moves: default_legal_moves,
		perspective_sensitivity: default_perspective_sensitivity,
		perspective_fov: default_perspective_fov,
		drag_enabled: default_drag_enabled,
		premove_mode: default_premove_mode,
	};

	preferences = browserStoragePrefs;

	const cookiePrefs: string | undefined = docutil.getCookieValue('preferences');
	if (cookiePrefs) {
		// console.log("Preferences cookie was present!");
		preferences = JSON.parse(decodeURIComponent(cookiePrefs));
		// console.log(jsutil.deepCopyObject(preferences));
		clientSidePrefs.forEach(pref => preferences![pref] = browserStoragePrefs[pref] );
	}
}

function savePreferences(): void {
	const oneYearInMillis: number = timeutil.getTotalMilliseconds({ years: 1 });
	localstorage.saveItem('preferences', preferences, oneYearInMillis);

	// After a delay, also send a post request to the server to update our preferences.
	// Auto send it if the window is closing
}

function onChangeMade(): void {
	changeWasMade = true;
	validatorama.getAccessToken(); // Preload the access token so that we are ready to quickly save our preferences on the server if the page is unloaded
}

async function sendPrefsToServer(): Promise<void> {
	if (!validatorama.areWeLoggedIn()) return;  // Ensure user is logged in
	if (!changeWasMade) return;  // Only send if preferences were changed
	changeWasMade = false;  // Reset the flag after sending

	console.log('Sending preferences to the server!');
	const preparedPrefs: ServerSidePreferences = preparePrefs();  // Prepare the preferences to send
	POSTPrefs(preparedPrefs);
}

async function POSTPrefs(preparedPrefs: ServerSidePreferences): Promise<void> {
	// Configure the POST request
	const config = {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			"is-fetch-request": "true" // Custom header
		} as Record<string, string>,
		body: JSON.stringify({ preferences: preparedPrefs }),  // Send the preferences as JSON
	};

	// Get the access token and add it to the Authorization header
	const token: string | undefined = await validatorama.getAccessToken();
	if (token) config.headers['Authorization'] = `Bearer ${token}`;  // If you use tokens for authentication

	try {
		const response: Response = await fetch('/api/set-preferences', config);
		
		// Check if the response status code indicates success (e.g., 200-299 range)
		if (response.ok) {
			console.log('Preferences updated successfully on the server.');
		} else {
			// Handle unsuccessful response
			const errorData: any = await response.json();
			console.error('Failed to update preferences on the server:', errorData.message || errorData);
		}
	} catch (error) {
		console.error('Error sending preferences to the server:', error);
	}
}

function preparePrefs(): ServerSidePreferences {
	const prefsCopy: Preferences = jsutil.deepCopyObject(preferences);
	Object.keys(prefsCopy).forEach(prefName => {
		if (clientSidePrefs.includes(prefName)) delete prefsCopy[prefName];
	});
	// console.log(`Original preferences: ${JSON.stringify(preferences)}`);
	// console.log(`Prepared preferences: ${JSON.stringify(prefsCopy)}`);
	return prefsCopy;
}

function getTheme(): string {
	return preferences.theme || themes.defaultTheme;
}

function setTheme(theme: string): void {
	preferences.theme = theme;
	console.log('Set theme');
	onChangeMade();
	savePreferences();
}

function getLegalMovesShape(): string {
	return preferences.legal_moves || default_legal_moves;
}

function setLegalMovesShape(legal_moves: 'dots' | 'squares'): void {
	if (typeof legal_moves !== 'string') throw new Error('Cannot set preference legal_moves when it is not a string.');
	preferences.legal_moves = legal_moves;
	onChangeMade();
	savePreferences();
}

function getDragEnabled(): boolean {
	return preferences.drag_enabled ?? default_drag_enabled;
}

function setDragEnabled(drag_enabled: boolean): void {
	if (typeof drag_enabled !== 'boolean') throw new Error('Cannot set preference drag_enabled when it is not a boolean.');
	preferences.drag_enabled = drag_enabled;
	savePreferences();
}

function getPremoveMode(): boolean {
	return preferences.premove_mode ?? default_premove_mode;
}

function setPremoveMode(premove_mode: boolean): void {
	if (typeof premove_mode !== 'boolean') throw new Error('Cannot set preference premove_mode when it is not a boolean.');
	preferences.premove_mode = premove_mode;
	savePreferences();
}

function getPerspectiveSensitivity(): number {
	return preferences.perspective_sensitivity || default_perspective_sensitivity;
}

function setPerspectiveSensitivity(perspective_sensitivity: number): void {
	if (typeof perspective_sensitivity !== 'number') throw new Error('Cannot set preference perspective_sensitivity when it is not a number.');
	preferences.perspective_sensitivity = perspective_sensitivity;
	savePreferences();
}

function getPerspectiveFOV(): number {
	return preferences.perspective_fov || default_perspective_fov;
}

function getDefaultPerspectiveFOV(): number {
	return default_perspective_fov;
}

function setPerspectiveFOV(perspective_fov: number): void {
	if (typeof perspective_fov !== 'number') throw new Error('Cannot set preference perspective_fov when it is not a number.');
	preferences.perspective_fov = perspective_fov;
	savePreferences();
	document.dispatchEvent(new CustomEvent('fov-change'));
}


// Getters for our current theme properties --------------------------------------------------------


function getColorOfLightTiles(): Color {
	const themeName: string = getTheme();
	return themes.getPropertyOfTheme(themeName, 'lightTiles');
}

function getColorOfDarkTiles(): Color {
	const themeName: string = getTheme();
	return themes.getPropertyOfTheme(themeName, 'darkTiles');
}

function getLegalMoveHighlightColor({ isOpponentPiece, isPremove }: { isOpponentPiece: boolean, isPremove: boolean }): Color {
	const themeName: string = getTheme();
	if (isOpponentPiece) return themes.getPropertyOfTheme(themeName, 'legalMovesHighlightColor_Opponent');
	else if (isPremove) return themes.getPropertyOfTheme(themeName, 'legalMovesHighlightColor_Premove');
	else return themes.getPropertyOfTheme(themeName, 'legalMovesHighlightColor_Friendly');
}

function getLastMoveHighlightColor(): Color {
	const themeName: string = getTheme();
	return themes.getPropertyOfTheme(themeName, 'lastMoveHighlightColor');
}

function getCheckHighlightColor(): Color {
	const themeName: string = getTheme();
	return themes.getPropertyOfTheme(themeName, 'checkHighlightColor'); 
}

function getBoxOutlineColor(): Color {
	const themeName: string = getTheme();
	return themes.getPropertyOfTheme(themeName, 'boxOutlineColor');
}

/** Returns the tint color for a piece of the given type, according to our current theme. */
function getTintColorOfType(type: number): Color {
	const [r, p] = typeutil.splitType(type);

	const baseColor: Color = pieceThemes.getBaseColorForType(r, p);

	const themeName: string = getTheme();
	const themePieceColors: Partial<PieceColorGroup> = themes.getPropertyOfTheme(themeName, "pieceTheme");
	const tint: Color = themePieceColors[p] ?? [1, 1, 1, 1];

	// Multiply the colors together to get the final color
	return [
		baseColor[0] * tint[0],
		baseColor[1] * tint[1],
		baseColor[2] * tint[2],
		baseColor[3] * tint[3]
	];
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
 * modifying of theme players using the keyboard keys!!!
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
};