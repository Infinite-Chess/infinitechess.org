// src/client/scripts/esm/game/gui/boardeditor/guiresetposition.ts

/**
 * Manages the GUI popup window for the Reset position button of the Board Editor
 */

import guifloatingwindow from './guifloatingwindow';
import eactions from '../../boardeditor/eactions';

// Elements ----------------------------------------------------------

/** The button the toggles visibility of the Start local game popup window. */
const element_resetbutton = document.getElementById('reset')!;

/** The actual window of the Game Rules popup. */
const element_window = document.getElementById('reset-position-UI')!;
const element_header = document.getElementById('reset-position-UI-header')!;
const element_closeButton = document.getElementById('close-reset-position-UI')!;

const yesButton = document.getElementById('reset-position-yes')!;
const noButton = document.getElementById('reset-position-no')!;

// Create floating window (generic behavior) -------------------------------------

const floatingWindow = guifloatingwindow.createFloatingWindow({
	windowEl: element_window,
	headerEl: element_header,
	toggleButtonEl: element_resetbutton,
	closeButtonEl: element_closeButton,
	onOpen: initResetPositionUIListeners,
	onClose: closeResetPositionUIListeners,
});

// Gamerules-specific listeners -------------------------------------------

function initResetPositionUIListeners(): void {
	yesButton.addEventListener('click', onYesButtonPress);
	noButton.addEventListener('click', onNoButtonPress);
}

function closeResetPositionUIListeners(): void {
	yesButton.removeEventListener('click', onYesButtonPress);
	noButton.removeEventListener('click', onNoButtonPress);
}

// Utilities---- -----------------------------------------------------------------

function onYesButtonPress(): void {
	eactions.reset();
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
