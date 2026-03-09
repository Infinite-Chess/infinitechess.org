// src/client/scripts/esm/game/boardeditor/eclipboard.ts

/**
 * Clipboard handlers for the Board Editor.
 *
 * Manages copy, cut, and paste operations, delegating to the
 * selection tool transformations or the game notation actions.
 */

import toast from '../gui/toast.js';
import gameslot from '../chess/gameslot.js';
import eactions from './actions/eactions.js';
import gameloader from '../chess/gameloader.js';
import etoolmanager from './tools/etoolmanager.js';
import selectiontool from './tools/selection/selectiontool.js';
import stransformations from './tools/selection/stransformations.js';

// Event Listeners ------------------------------------------------------------

/** Registers the copy/cut/paste event listeners on the document. */
function addEventListeners(): void {
	document.addEventListener('copy', onCopy);
	document.addEventListener('cut', onCut);
	document.addEventListener('paste', onPaste);
	document.addEventListener('copy-game', onCopyGame);
	document.addEventListener('paste-game', onPasteGame);
}

/** Removes the copy/cut/paste event listeners from the document. */
function removeEventListeners(): void {
	document.removeEventListener('copy', onCopy);
	document.removeEventListener('cut', onCut);
	document.removeEventListener('paste', onPaste);
	document.removeEventListener('copy-game', onCopyGame);
	document.removeEventListener('paste-game', onPasteGame);
}

// Handlers -------------------------------------------------------------------

/** Custom Board Editor handler for the Copy event. */
function onCopy(): void {
	if (document.activeElement instanceof HTMLInputElement) return; // Don't copy if the user is typing in an input field
	if (window.getSelection()?.toString()) return; // Don't copy if the user has text selected in the UI

	if (etoolmanager.getTool() !== 'selection-tool') {
		// Copy game notation
		document.dispatchEvent(new Event('copy-game'));
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
	if (gameloader.areWeLoadingGame()) return toast.showPleaseWaitForTask();

	if (etoolmanager.getTool() !== 'selection-tool') {
		// Paste game notation
		document.dispatchEvent(new Event('paste-game'));
	} else if (selectiontool.isExistingSelection()) {
		// Paste clipboard at current selection
		const gamefile = gameslot.getGamefile()!;
		const mesh = gameslot.getMesh()!;
		const selectionBox = selectiontool.getSelectionIntBox()!;
		stransformations.Paste(gamefile, mesh, selectionBox);
	}
}

/** Board Editor handler for the 'copy-game' custom event. Copies the full position as game notation. */
function onCopyGame(): void {
	eactions.copy();
}

/** Board Editor handler for the 'paste-game' custom event. Pastes game notation from the clipboard. */
function onPasteGame(): void {
	eactions.paste();
}

// Exports --------------------------------------------------------------------

export default {
	addEventListeners,
	removeEventListeners,
};
