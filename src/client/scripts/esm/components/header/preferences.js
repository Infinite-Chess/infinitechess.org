import themes from "./themes.js";
import localstorage from "../../util/localstorage.js";
import timeutil from "../../game/misc/timeutil.js";


let preferences; // { theme, legal_moves }

// The legal moves shape preference
const default_legal_moves = 'dots';
const legal_move_shapes = ['squares','dots'];
const default_perspective_sensitivity = 100;
const default_perspective_fov = 90;


(function init() {
	loadPreferences();
})();

function loadPreferences() {
	preferences = localstorage.loadItem('preferences') || {
		theme: themes.defaultTheme,
		legal_moves: default_legal_moves,
		perspective_sensitivity: default_perspective_sensitivity,
	};

	// Here send a request to the server for our preferences,
	// Once our initial validation request is back. listen for the event maybe?
}

function savePreferences() {
	const oneYearInMillis = timeutil.getTotalMilliseconds({ years: 1});
	localstorage.saveItem('preferences', preferences, oneYearInMillis);

	// After a delay, also send a post request to the server to update our preferences.
	// Auto send it if the window is closing
}


function getTheme() {
	return preferences.theme || themes.defaultTheme;
}
function setTheme(theme) {
	preferences.theme = theme;
	savePreferences();
}

function getLegalMovesShape() {
	return preferences.legal_moves || default_legal_moves;
}
function setLegalMovesShape(legal_moves) {
	if (typeof legal_moves !== 'string') throw new Error('Cannot set preference legal_moves when it is not a string.');
	preferences.legal_moves = legal_moves;
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
	getPerspectiveSensitivity,
	setPerspectiveSensitivity,
	getPerspectiveFOV,
	getDefaultPerspectiveFOV,
	setPerspectiveFOV,
};