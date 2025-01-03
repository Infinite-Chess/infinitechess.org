
import selection from '../chess/selection.js';
import guipromotion from './guipromotion.js';
import style from './style.js';
import statustext from './statustext.js';
import frametracker from '../rendering/frametracker.js';
import movement from '../rendering/movement.js';

"use strict";

/**
 * This is the parent gui script of all gui scripts.
 * Here we remember what page we're on,
 * and we have a reference to the overlay element above the entire canvas.
 */

// Variables

const element_overlay = document.getElementById('overlay');

element_overlay.addEventListener('click', callback_CancelPromotionIfUIOpen);

function callback_CancelPromotionIfUIOpen() {
	if (!guipromotion.isUIOpen()) return;
	selection.unselectPiece();
	frametracker.onVisualChange();
}

// Functions


// Fades-in the overlay element over 1 second
function fadeInOverlay1s() {
	style.fadeIn1s(element_overlay);
}

function callback_featurePlanned() {
	statustext.showStatus(translations.planned_feature);
}

function makeOverlayUnselectable() {
	element_overlay.classList.add('unselectable');
}

function makeOverlaySelectable() {
	element_overlay.classList.remove('unselectable');
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

export default {
	prepareForOpen,
	fadeInOverlay1s,
	callback_featurePlanned,
	makeOverlayUnselectable,
	makeOverlaySelectable
};