import themes from "./themes.js";
import localstorage from "../../util/localstorage.js";
import timeutil from "../../util/timeutil.js";
import validatorama from "../../util/validatorama.js";
import jsutil from "../../util/jsutil.js";
import docutil from "../../util/docutil.js";


let preferences; // { theme, legal_moves }

// The legal moves shape preference
const default_legal_moves = 'squares'; // dots/squares
const default_drag_enabled = true;
const default_perspective_sensitivity = 100;
const default_perspective_fov = 90;

/** Prefs that do NOT get saved on the server side */
const clientSidePrefs = ['perspective_sensitivity', 'perspective_fov', 'drag_enabled'];

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
		console.log("Preferences cookie was present!");
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
	onChangeMade();
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


export default {
	getTheme,
	setTheme,
	getLegalMovesShape,
	setLegalMovesShape,
	getDragEnabled,
	setDragEnabled,
	getPerspectiveSensitivity,
	setPerspectiveSensitivity,
	getPerspectiveFOV,
	getDefaultPerspectiveFOV,
	setPerspectiveFOV,
	sendPrefsToServer,
};