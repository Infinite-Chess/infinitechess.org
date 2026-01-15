// src/client/scripts/esm/game/gui/boardeditor/guiclearposition.ts

/**
 * Manages the GUI popup window for the Clear position button of the Board Editor
 */

import guifloatingwindow from './guifloatingwindow';
import eactions from '../../boardeditor/eactions';

// Elements ----------------------------------------------------------

/** The button the toggles visibility of the Start local game popup window. */
const element_clearbutton = document.getElementById('clearall')!;

/** The actual window of the Game Rules popup. */
const element_window = document.getElementById('clear-position-UI')!;
const element_header = document.getElementById('clear-position-UI-header')!;
const element_closeButton = document.getElementById('close-clear-position-UI')!;

const yesButton = document.getElementById('clear-position-yes')!;
const noButton = document.getElementById('clear-position-no')!;

// Create floating window (generic behavior) -------------------------------------

const floatingWindow = guifloatingwindow.createFloatingWindow({
	windowEl: element_window,
	headerEl: element_header,
	toggleButtonEl: element_clearbutton,
	closeButtonEl: element_closeButton,
	onOpen: initClearPositionUIListeners,
	onClose: closeClearPositionUIListeners,
});

// Gamerules-specific listeners -------------------------------------------

function initClearPositionUIListeners(): void {
	yesButton.addEventListener('click', onYesButtonPress);
	noButton.addEventListener('click', onNoButtonPress);
}

function closeClearPositionUIListeners(): void {
	yesButton.removeEventListener('click', onYesButtonPress);
	noButton.removeEventListener('click', onNoButtonPress);
}

// Utilities---- -----------------------------------------------------------------

function onYesButtonPress(): void {
	eactions.clearAll();
	floatingWindow.close();
}

function onNoButtonPress(): void {
	floatingWindow.close();
}

// Exports -----------------------------------------------------------------

export default {
	close: floatingWindow.close,
	toggle: floatingWindow.toggle,
	resetPositioning: floatingWindow.resetPositioning,
};
