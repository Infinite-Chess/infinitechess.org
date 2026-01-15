// src/client/scripts/esm/game/gui/boardeditor/guistartlocalgame.ts

/**
 * Manages the GUI popup window for the Start local game button of the Board Editor
 */

import guifloatingwindow from './guifloatingwindow';
import eactions from '../../boardeditor/eactions';

// Elements ----------------------------------------------------------

/** The button the toggles visibility of the Start local game popup window. */
const element_localgamebutton = document.getElementById('start-local-game')!;

/** The actual window of the Game Rules popup. */
const element_window = document.getElementById('local-game-UI')!;
const element_header = document.getElementById('local-game-UI-header')!;
const element_closeButton = document.getElementById('close-local-game-UI')!;

const yesButton = document.getElementById('start-local-game-yes')!;
const noButton = document.getElementById('start-local-game-no')!;

// Create floating window (generic behavior) -------------------------------------

const floatingWindow = guifloatingwindow.createFloatingWindow({
	windowEl: element_window,
	headerEl: element_header,
	toggleButtonEl: element_localgamebutton,
	closeButtonEl: element_closeButton,
	onOpen: initLocalGameUIListeners,
	onClose: closeLocalGameUIListeners,
});

// Gamerules-specific listeners -------------------------------------------

function initLocalGameUIListeners(): void {
	yesButton.addEventListener('click', onYesButtonPress);
	noButton.addEventListener('click', onNoButtonPress);
}

function closeLocalGameUIListeners(): void {
	yesButton.removeEventListener('click', onYesButtonPress);
	noButton.removeEventListener('click', onNoButtonPress);
}

// Utilities---- -----------------------------------------------------------------

function onYesButtonPress(): void {
	eactions.startLocalGame();
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
