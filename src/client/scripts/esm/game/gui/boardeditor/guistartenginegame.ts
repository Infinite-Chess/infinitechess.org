// src/client/scripts/esm/game/gui/boardeditor/guistartenginegame.ts

/**
 * Manages the GUI popup window for the Start engine game button of the Board Editor
 */

import guifloatingwindow from './guifloatingwindow';
import eactions from '../../boardeditor/eactions';

// Elements ----------------------------------------------------------

/** The button the toggles visibility of the Start engine game popup window. */
const element_enginegamebutton = document.getElementById('start-engine-game')!;

/** The actual window of the Game Rules popup. */
const element_window = document.getElementById('engine-game-UI')!;
const element_header = document.getElementById('engine-game-UI-header')!;
const element_closeButton = document.getElementById('close-engine-game-UI')!;

const yesButton = document.getElementById('start-engine-game-yes')!;
const noButton = document.getElementById('start-engine-game-no')!;

// Create floating window (generic behavior) -------------------------------------

const floatingWindow = guifloatingwindow.createFloatingWindow({
	windowEl: element_window,
	headerEl: element_header,
	toggleButtonEl: element_enginegamebutton,
	closeButtonEl: element_closeButton,
	onOpen: initEngineGameUIListeners,
	onClose: closeEngineGameUIListeners,
});

// Gamerules-specific listeners -------------------------------------------

function initEngineGameUIListeners(): void {
	yesButton.addEventListener('pointerup', onYesButtonPress);
	noButton.addEventListener('pointerup', onNoButtonPress);
}

function closeEngineGameUIListeners(): void {
	yesButton.removeEventListener('pointerup', onYesButtonPress);
	noButton.removeEventListener('pointerup', onNoButtonPress);
}

// Utilities---- -----------------------------------------------------------------

function onYesButtonPress(): void {
	eactions.startEngineGame();
}

function onNoButtonPress(): void {
	floatingWindow.close();
}

// Exports -----------------------------------------------------------------

export default {
	closeEngineGameUI: floatingWindow.close,
	toggleEngineGameUI: floatingWindow.toggle,
	resetPositioning: floatingWindow.resetPositioning,
};
