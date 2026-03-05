// src/client/scripts/esm/game/gui/boardeditor/guistartlocalgame.ts

/**
 * Manages the GUI popup window for the Start local game button of the Board Editor
 */

import eactions from '../../boardeditor/actions/eactions';
import guipause from '../guipause';
import guifloatingwindow from './guifloatingwindow';
import { listener_document } from '../../chess/game';

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

const floatingWindow = guifloatingwindow.create({
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
	document.addEventListener('keydown', onKeyDown);
}

function closeLocalGameUIListeners(): void {
	yesButton.removeEventListener('click', onYesButtonPress);
	noButton.removeEventListener('click', onNoButtonPress);
	document.removeEventListener('keydown', onKeyDown);
}

// Utilities---------------------------------------------------------------------

function onKeyDown(e: KeyboardEvent): void {
	if (e.key === 'Enter') onYesButtonPress();
	else if (e.key === 'Escape') {
		// Ensure priority when deciding who gets the escape key event
		if (guipause.areWePaused()) return;
		listener_document.claimKey('Escape');
		onNoButtonPress();
	}
}

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
