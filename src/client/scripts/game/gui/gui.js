
// Import Start
import selection from '../chess/selection.js';
import guipromotion from './guipromotion.js';
import style from './style.js';
import statustext from './statustext.js';
import frametracker from '../rendering/frametracker.js';
// Import End

"use strict";

/**
 * This is the parent gui script of all gui scripts.
 * Here we remember what page we're on,
 * and we have a reference to the overlay element above the entire canvas.
 */

// Variables

let screen = ''; // Current screen location in the game.  title/online/computer/local/board  

const element_overlay = document.getElementById('overlay');

element_overlay.addEventListener('click', callback_CancelPromotionIfUIOpen);

function callback_CancelPromotionIfUIOpen() {
    if (!guipromotion.isUIOpen()) return;
    selection.unselectPiece();
    frametracker.onVisualChange();
}

// Functions

function getScreen() {
    return screen;
}

function setScreen(value) {
    screen = value;
}

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

export default {
    fadeInOverlay1s,
    getScreen,
    setScreen,
    callback_featurePlanned,
    makeOverlayUnselectable,
    makeOverlaySelectable
};