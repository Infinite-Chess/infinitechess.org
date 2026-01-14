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

// Create floating window (generic behavior) -------------------------------------

const floatingWindow = guifloatingwindow.createFloatingWindow({
	windowEl: element_window,
	headerEl: element_header,
	toggleButtonEl: element_localgamebutton,
	closeButtonEl: element_closeButton,
});

// Utilities---- -----------------------------------------------------------------

/** Called when users click the "Start local game from position" button. */
function handleStartLocalGame(): void {
	// Show a dialog box to confirm they want to leave the editor
	const result = confirm(
		'Do you want to leave the board editor and start a local game from this position? Changes will be saved.',
	); // PLANNED to save changes
	// Start the local game as requested
	if (result) eactions.startLocalGame();
}

// Exports -----------------------------------------------------------------

export default {
	closeLocalGameUI: floatingWindow.close,
	toggleLocalGameUI: floatingWindow.toggle,
	resetPositioning: floatingWindow.resetPositioning,
};
