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

// Create floating window -------------------------------------

const floatingWindow = guifloatingwindow.createFloatingWindow({
	windowEl: element_window,
	headerEl: element_header,
	closeButtonEl: element_closeButton,
	onOpen,
	onClose,
});

// Toggling ---------------------------------------------

function onOpen(): void {
	element_localgamebutton.classList.add('active');
	initLocalGameUIListeners();
}

function onClose(resetPositioning: boolean): void {
	if (resetPositioning) floatingWindow.resetPositioning();
	element_localgamebutton.classList.remove('active');
	closeLocalGameUIListeners();
}

// Gamerules-specific listeners -------------------------------------------

function initLocalGameUIListeners(): void {
	yesButton.addEventListener('click', onYesButtonPress);
	noButton.addEventListener('click', onNoButtonPress);
}

function closeLocalGameUIListeners(): void {
	yesButton.removeEventListener('click', onYesButtonPress);
	noButton.removeEventListener('click', onNoButtonPress);
}

// Utilities---------------------------------------------------------------------

function onYesButtonPress(): void {
	eactions.startLocalGame();
}

function onNoButtonPress(): void {
	floatingWindow.close(false);
}

// Exports -----------------------------------------------------------------

export default {
	open: floatingWindow.open,
	close: floatingWindow.close,
	isOpen: floatingWindow.isOpen,
};
