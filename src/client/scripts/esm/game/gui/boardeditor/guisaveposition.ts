// src/client/scripts/esm/game/gui/boardeditor/guisaveposition.ts

/**
 * Manages the GUI popup window for the Save Positions UI of the board editor.
 * Borrows a lot of logic from guiloadposition.ts since the saved positions list is very similar
 */

import guifloatingwindow from './guifloatingwindow';
import guiloadposition from './guiloadposition';

// Elements ----------------------------------------------------------

/** The button the toggles visibility of the Start local game popup window. */
const element_savebutton = document.getElementById('save-position-as')!;

/** The actual window of the Game Rules popup. */
const element_window = document.getElementById('save-position-UI')!;
const element_header = document.getElementById('save-position-UI-header')!;
const element_closeButton = document.getElementById('close-save-position-UI')!;

/** List of saved positions */
const element_savedPositionsToSave = document.getElementById('save-position-UI-saved-positions')!;

// Create floating window (generic behavior) -------------------------------------

const floatingWindow = guifloatingwindow.createFloatingWindow({
	windowEl: element_window,
	headerEl: element_header,
	toggleButtonEl: element_savebutton,
	closeButtonEl: element_closeButton,
	onOpen,
	onClose,
});

// Gamerules-specific listeners -------------------------------------------

function initSavePositionUIListeners(): void {}

function closeSavePositionUIListeners(): void {}

// Utilities----------------------------------------------------------------

function onOpen(): void {
	guiloadposition.setSavedPositionListUI(element_savedPositionsToSave);
	initSavePositionUIListeners();
}

function onClose(): void {
	closeSavePositionUIListeners();
}

// Exports -----------------------------------------------------------------

export default {
	close: floatingWindow.close,
	toggle: floatingWindow.toggle,
	resetPositioning: floatingWindow.resetPositioning,
};
