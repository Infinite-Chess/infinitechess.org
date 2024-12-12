
/**
 * This script handles our promotion menu, when
 * pawns reach the promotion line.
 */

import spritesheet from '../rendering/spritesheet.js';
// @ts-ignore
import perspective from '../rendering/perspective.js';
// @ts-ignore
import selection from '../chess/selection.js';
// @ts-ignore
import style from './style.js';
// @ts-ignore
import colorutil from '../../chess/util/colorutil.js';

"use strict";


// Variables --------------------------------------------------------------------


const element_Promote = document.getElementById('promote');
const element_PromoteWhite = document.getElementById('promotewhite');
const element_PromoteBlack = document.getElementById('promoteblack');

let selectionOpen = false; // True when promotion GUI visible. Do not listen to navigational controls in the mean time


// Functions --------------------------------------------------------------------


function isUIOpen() { return selectionOpen; }

function open(color: string) {
	selectionOpen = true;
	style.revealElement(element_Promote!);
	if (color === 'white') style.revealElement(element_PromoteWhite!);
	else if (color === 'black') style.revealElement(element_PromoteBlack!);
	else throw new Error(`Promotion UI does not support color "${color}"`)
}

/** Closes the promotion UI */
function close() {
	selectionOpen = false;
	style.hideElement(element_PromoteWhite!);
	style.hideElement(element_PromoteBlack!);
	style.hideElement(element_Promote!);
}

/**
 * Inits the promotion UI. Hides promotions not allowed, reveals promotions allowed.
 * @param {Object} promotionsAllowed - An object that contains the information about what promotions are allowed.
 * It contains 2 properties, `white` and `black`, both of which are arrays which may look like `['queens', 'bishops']`.
 */
function initUI(promotionsAllowed: { [color: string]: string[]} | undefined) {
	if (promotionsAllowed === undefined) return;
    const white = promotionsAllowed.white; // ['queens','bishops']
    const black = promotionsAllowed.black;

	if (element_PromoteWhite!.childElementCount > 0 || element_PromoteBlack!.childElementCount > 0) {
		throw new Error("Must reset promotion UI before initiating it, or promotions leftover from the previous game will bleed through.");
	}

	const whiteExt = colorutil.getColorExtensionFromColor('white');
	const blackExt = colorutil.getColorExtensionFromColor('black');

	const whiteSVGs = spritesheet.getCachedSVGElements(white.map(promotion => promotion + whiteExt))
	const blackSVGs = spritesheet.getCachedSVGElements(black.map(promotion => promotion + blackExt))

    // Create and append allowed promotion options for white
    whiteSVGs.forEach(svg => {
		// TODO: Make a copy instead of modifying the cached piece
        svg.classList.add('promotepiececontainer');
		svg.addEventListener('click', callback_promote);
        element_PromoteWhite!.appendChild(svg);
    });

    // Create and append allowed promotion options for black
    blackSVGs.forEach(svg => {
		// TODO: Make a copy instead of modifying the cached piece
        svg.classList.add('promotepiececontainer');
		svg.addEventListener('click', callback_promote);
        element_PromoteBlack!.appendChild(svg);
    });
}

/**
 * Resets the promotion UI by clearing all promotion options.
 */
function resetUI() {
    while (element_PromoteWhite!.firstChild) {
		const svg = element_PromoteWhite!.firstChild;
		element_PromoteWhite!.removeChild(svg);
		svg.removeEventListener('click', callback_promote);
	}
    while (element_PromoteBlack!.firstChild) {
		const svg = element_PromoteBlack!.firstChild;
		element_PromoteBlack!.removeChild(svg);
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