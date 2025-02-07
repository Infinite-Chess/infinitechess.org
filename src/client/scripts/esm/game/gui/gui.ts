
/**
 * This script adds event listeners for our main overlay html element that
 * contains all of our gui pages.
 * 
 * We also prepare the board here whenever ANY gui page (non-game) is opened.
 */

import selection from '../chess/selection.js';
// @ts-ignore
import guipromotion from './guipromotion.js';
// @ts-ignore
import statustext from './statustext.js';
import frametracker from '../rendering/frametracker.js';
// @ts-ignore
import movement from '../rendering/movement.js';


// Variables ------------------------------------------------------------------------------


const element_overlay: HTMLElement = document.getElementById('overlay')!;


// Functions ------------------------------------------------------------------------------


element_overlay.addEventListener('click', callback_CancelPromotionIfUIOpen);

function callback_CancelPromotionIfUIOpen() {
	if (!guipromotion.isUIOpen()) return;
	selection.unselectPiece();
	frametracker.onVisualChange();
}

/**
 * Call when we first load the page, or leave any game. This prepares the board
 * for either the title screen or lobby (any screen that's not in a game)
 */
function prepareForOpen() {
	// Randomize pan velocity direction for the title screen and lobby menus
	movement.randomizePanVelDir();
	movement.setBoardScale(1.8); // 1.8
}

/** Displays the status message on screen "Feature is planned". */
function displayStatus_FeaturePlanned() {
	statustext.showStatus(translations['planned_feature']);
}


export default {
	prepareForOpen,
	displayStatus_FeaturePlanned,
};