// src/client/scripts/esm/game/gui/boardeditor/guiloadposition.ts

/**
 * Manages the GUI popup window for the Load Positions UI of the board editor
 */

import guifloatingwindow from './guifloatingwindow';

// Elements ----------------------------------------------------------

/** The button the toggles visibility of the Start local game popup window. */
const element_loadbutton = document.getElementById('load-position')!;

/** The actual window of the Game Rules popup. */
const element_window = document.getElementById('saved-positions-UI')!;
const element_header = document.getElementById('saved-positions-UI-header')!;
const element_closeButton = document.getElementById('close-saved-positions-UI')!;

// Create floating window (generic behavior) -------------------------------------

const floatingWindow = guifloatingwindow.createFloatingWindow({
	windowEl: element_window,
	headerEl: element_header,
	toggleButtonEl: element_loadbutton,
	closeButtonEl: element_closeButton,
	onOpen: initLoadPositionUIListeners,
	onClose: closeLoadPositionUIListeners,
});

// Gamerules-specific listeners -------------------------------------------

function initLoadPositionUIListeners(): void {}

function closeLoadPositionUIListeners(): void {}

// Utilities----------------------------------------------------------------

// Exports -----------------------------------------------------------------

export default {
	close: floatingWindow.close,
	toggle: floatingWindow.toggle,
	resetPositioning: floatingWindow.resetPositioning,
};
