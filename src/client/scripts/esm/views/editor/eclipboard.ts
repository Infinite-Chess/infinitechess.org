// src/client/scripts/esm/views/editor/eclipboard.ts

/**
 * Clipboard handlers for the Board Editor.
 *
 * Manages copy, cut, and paste operations, delegating to the
 * selection tool transformations or the game notation actions.
 */

import toast from '../../components/toast.js';
import gameslot from '../../game/chess/gameslot.js';
import eactions from './actions/eactions.js';
import gamesession from '../../game/chess/gamesession.js';
import etoolmanager from './tools/etoolmanager.js';
import selectiontool from './tools/selection/selectiontool.js';
import stransformations from './tools/selection/stransformations.js';

// Event Listeners -------------------------------------------------------------

/** Registers the copy/cut/paste event listeners on the document. */
function addEventListeners(): void {
	document.addEventListener('copy', onCopy);
	document.addEventListener('cut', onCut);
	document.addEventListener('paste', onPaste);
}

// Handlers --------------------------------------------------------------------

/** Custom Board Editor handler for the Copy event. */
function onCopy(): void {
	if (document.activeElement instanceof HTMLInputElement) return; // Don't copy if the user is typing in an input field
	if (window.getSelection()?.toString()) return; // Don't copy if the user has text selected in the UI

	if (etoolmanager.getTool() !== 'selection-tool') {
		eactions.copy(); // Copy the full position as game notation
	} else if (selectiontool.isExistingSelection()) {
		// Copy current selection
		const gamefile = gameslot.getGamefile()!;
		const selectionBox = selectiontool.getSelectionIntBox()!;
		stransformations.Copy(gamefile, selectionBox);
	}
}

/** Board Editor handler for the Cut event. */
function onCut(): void {
	if (document.activeElement instanceof HTMLInputElement) return; // Don't cut if the user is typing in an input field
	if (window.getSelection()?.toString()) return; // Don't cut if the user has text selected in the UI

	if (etoolmanager.getTool() !== 'selection-tool' || !selectiontool.isExistingSelection()) return;

	// Cut current selection
	const gamefile = gameslot.getGamefile()!;
	const mesh = gameslot.getMesh()!;
	const selectionBox = selectiontool.getSelectionIntBox()!;
	stransformations.Copy(gamefile, selectionBox);
	stransformations.Delete(gamefile, mesh, selectionBox);
}

/** Custom Board Editor handler for the Paste event. */
function onPaste(): void {
	if (document.activeElement instanceof HTMLInputElement) return; // Don't paste if the user is typing in an input field
	if (gamesession.isLoading()) return toast.showPleaseWaitForTask();

	if (etoolmanager.getTool() !== 'selection-tool') {
		eactions.paste(); // Paste game notation from the clipboard
	} else if (selectiontool.isExistingSelection()) {
		// Paste clipboard at current selection
		const gamefile = gameslot.getGamefile()!;
		const mesh = gameslot.getMesh()!;
		const selectionBox = selectiontool.getSelectionIntBox()!;
		stransformations.Paste(gamefile, mesh, selectionBox);
	}
}

// Exports ---------------------------------------------------------------------

export default {
	addEventListeners,
};
