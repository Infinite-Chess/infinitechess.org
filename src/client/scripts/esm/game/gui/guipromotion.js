
// Import Start
import perspective from '../rendering/perspective.js';
import selection from '../chess/selection.js';
import style from './style.js';
import spritesheet from '../rendering/spritesheet.js';
import colorutil from '../../chess/util/colorutil.js';
// Import End

"use strict";

/**
 * This script handles our promotion menu, when
 * pawns reach the promotion line.
 */

// Variables

// Promotion
const element_Promote = document.getElementById('promote');
const element_PromoteWhite = document.getElementById('promotewhite');
const element_PromoteBlack = document.getElementById('promoteblack');

let selectionOpen = false; // True when promotion GUI visible. Do not listen to navigational controls in the mean time

// Functions

function isUIOpen() { return selectionOpen; }

function open(color) {
	selectionOpen = true;
	style.revealElement(element_Promote);
	if (color === 'white') {
		style.hideElement(element_PromoteBlack);
		style.revealElement(element_PromoteWhite);
	} else {
		style.hideElement(element_PromoteWhite);
		style.revealElement(element_PromoteBlack);
	}
	perspective.unlockMouse();
}

/** Closes the promotion UI */
function close() {
	selectionOpen = false;
	style.hideElement(element_Promote);
}

/**
 * Inits the promotion UI. Hides promotions not allowed, reveals promotions allowed.
 * @param {Object} promotionsAllowed - An object that contains the information about what promotions are allowed.
 * It contains 2 properties, `white` and `black`, both of which are arrays which may look like `['queens', 'bishops']`.
 */
function initUI(promotionsAllowed) {
    promotionsAllowed = promotionsAllowed || { white: [], black: [] };
	/** @type {string[]} */
    const white = promotionsAllowed.white; // ['queens','bishops']
	/** @type {string[]} */
    const black = promotionsAllowed.black;

	if (element_PromoteWhite.childElementCount > 0 || element_PromoteBlack.childElementCount > 0) {
		throw new Error("Must reset promotion UI before initiating it, or promotions leftover from the previous game will bleed through.");
	}

	const whiteExt = colorutil.getColorExtensionFromColor('white');
	const blackExt = colorutil.getColorExtensionFromColor('black');

	const whiteSVGs = spritesheet.getCachedSVGElements(black.map(promotion => promotion + whiteExt))
	const blackSVGs = spritesheet.getCachedSVGElements(black.map(promotion => promotion + blackExt))

    // Create and append allowed promotion options for white
    whiteSVGs.forEach(svg => {
		// TODO: Make a copy instead of modifying the cached piece
        svg.classList.add('promotepiececontainer');
		svg.addEventListener('click', callback_promote);
        element_PromoteWhite.appendChild(svg);
    });

    // Create and append allowed promotion options for black
    blackSVGs.forEach(svg => {
		// TODO: Make a copy instead of modifying the cached piece
        svg.classList.add('promotepiececontainer');
		svg.addEventListener('click', callback_promote);
        element_PromoteBlack.appendChild(svg);
    });
}

/**
 * Resets the promotion UI by clearing all promotion options.
 */
function resetUI() {
    while (element_PromoteWhite.firstChild) {
		const svg = element_PromoteWhite.firstChild;
		element_PromoteWhite.removeChild(svg);
		svg.removeEventListener('click', callback_promote);
	}
    while (element_PromoteBlack.firstChild) {
		const svg = element_PromoteBlack.firstChild;
		element_PromoteBlack.removeChild(svg);
		svg.removeEventListener('click', callback_promote);
	}
}

function callback_promote(event) {
	const type = event.srcElement.classList[1];
	// TODO: Dispatch a custom 'promote-selected' event!
	// That way this script doesn't depend on selection.js
	selection.promoteToType(type);
	close();
}

export default {
	isUIOpen,
	open,
	close,
	initUI,
	resetUI,
};