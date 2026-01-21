// src/client/scripts/esm/game/gui/boardeditor/guiloadposition.ts

/**
 * Manages the GUI popup window for the Load Positions UI of the board editor
 */

import guifloatingwindow from './guifloatingwindow';

// Elements ----------------------------------------------------------

/** The button the toggles visibility of the Start local game popup window. */
const element_loadbutton = document.getElementById('load-position')!;

/** The actual window of the Game Rules popup. */
const element_window = document.getElementById('load-position-UI')!;
const element_header = document.getElementById('load-position-UI-header')!;
const element_closeButton = document.getElementById('close-load-position-UI')!;

/** List of saved positions */
const element_savedPositionsToLoad = document.getElementById('load-position-UI-saved-positions')!;

// Create floating window (generic behavior) -------------------------------------

const floatingWindow = guifloatingwindow.createFloatingWindow({
	windowEl: element_window,
	headerEl: element_header,
	toggleButtonEl: element_loadbutton,
	closeButtonEl: element_closeButton,
	onOpen,
	onClose,
});

// Gamerules-specific listeners -------------------------------------------

function initLoadPositionUIListeners(): void {}

function closeLoadPositionUIListeners(): void {}

// Utilities----------------------------------------------------------------

function onOpen(): void {
	setSavedPositionListUI();
	initLoadPositionUIListeners();
}

function onClose(): void {
	closeLoadPositionUIListeners();
}

function setSavedPositionListUI(): void {
	// empty existing content
	element_savedPositionsToLoad.replaceChildren();

	const ROWS = 30;

	for (let i = 0; i < ROWS; i++) {
		const row = document.createElement('div');
		row.className = 'saved-position unselectable';

		const cols = ['Name', 'Piece count', 'Date', 'Buttons'];
		for (const text of cols) {
			const cell = document.createElement('div');
			cell.textContent = text;
			row.appendChild(cell);
		}

		element_savedPositionsToLoad.appendChild(row);
	}
}

// Exports -----------------------------------------------------------------

export default {
	close: floatingWindow.close,
	toggle: floatingWindow.toggle,
	resetPositioning: floatingWindow.resetPositioning,
};
