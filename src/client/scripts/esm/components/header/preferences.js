import themes from "./themes.js";
import localstorage from "../../util/localstorage.js";
import timeutil from "../../game/misc/timeutil.js";


let preferences; // { theme, legal_moves }

// The legal moves shape preference
const default_legal_moves = 'dot';
// const default_legal_moves = 'square';
const legal_move_shapes = ['square','dot'];


(function init() {
	loadPreferences();
})();

function loadPreferences() {
	preferences = localstorage.loadItem('preferences') || {
		theme: themes.defaultTheme,
		legal_moves: default_legal_moves,
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
	preferences.legal_moves = legal_moves;
	savePreferences();
}


export default {
	getTheme,
	setTheme,
	getLegalMovesShape,
	setLegalMovesShape,
};