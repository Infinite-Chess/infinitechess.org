
/**
 * This script handles our promotion menu, when
 * pawns reach the promotion line.
 */

import spritesheet from '../rendering/spritesheet.js';
import selection from '../chess/selection.js';
// @ts-ignore
import style from './style.js';
// @ts-ignore
import colorutil from '../../chess/util/colorutil.js';
import frametracker from '../rendering/frametracker.js';

"use strict";


// Variables --------------------------------------------------------------------


const element_Promote = document.getElementById('promote');
const element_PromoteWhite = document.getElementById('promotewhite');
const element_PromoteBlack = document.getElementById('promoteblack');

let selectionOpen = false; // True when promotion GUI visible. Do not listen to navigational controls in the mean time

const element_overlay: HTMLElement = document.getElementById('overlay')!;

// Functions --------------------------------------------------------------------

element_overlay.addEventListener('click', callback_CancelPromotionIfUIOpen);

function callback_CancelPromotionIfUIOpen() {
	if (!isUIOpen()) return;
	selection.unselectPiece();
	frametracker.onVisualChange();
}

function isUIOpen() { return selectionOpen; }

function open(color: string) {
	selectionOpen = true;
	element_Promote?.classList.remove('hidden');
	if (color === 'white') element_PromoteWhite?.classList.remove('hidden');
	else if (color === 'black') element_PromoteBlack?.classList.remove('hidden');
	else throw new Error(`Promotion UI does not support color "${color}"`);
}

/** Closes the promotion UI */
function close() {
	selectionOpen = false;
	element_PromoteWhite?.classList.add('hidden');
	element_PromoteBlack?.classList.add('hidden');
	element_Promote?.classList.add('hidden');
}

/**
 * Inits the promotion UI. Hides promotions not allowed, reveals promotions allowed.
 * @param {Object} promotionsAllowed - An object that contains the information about what promotions are allowed.
 * It contains 2 properties, `white` and `black`, both of which are arrays which may look like `['queens', 'bishops']`.
 */
function initUI(promotionsAllowed: { [color: string]: string[]} | undefined) {
	if (promotionsAllowed === undefined) return;
	const white = promotionsAllowed['white']!; // ['queens','bishops']
	const black = promotionsAllowed['black']!;

	if (element_PromoteWhite!.childElementCount > 0 || element_PromoteBlack!.childElementCount > 0) {
		throw new Error("Must reset promotion UI before initiating it, or promotions leftover from the previous game will bleed through.");
	}

	const whiteExt = colorutil.getColorExtensionFromColor('white');
	const blackExt = colorutil.getColorExtensionFromColor('black');

	const whiteSVGs = spritesheet.getCachedSVGElements(white.map(promotion => promotion + whiteExt));
	const blackSVGs = spritesheet.getCachedSVGElements(black.map(promotion => promotion + blackExt));

	// Create and append allowed promotion options for white
	whiteSVGs.forEach(svg => {
		// TODO: Make a copy instead of modifying the cached piece
		svg.classList.add('promotepiece');
		svg.addEventListener('click', callback_promote);
        element_PromoteWhite!.appendChild(svg);
	});

	// Create and append allowed promotion options for black
	blackSVGs.forEach(svg => {
		// TODO: Make a copy instead of modifying the cached piece
		svg.classList.add('promotepiece');
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

function callback_promote(event: Event) {
	const type = (event.currentTarget as HTMLElement).id;
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