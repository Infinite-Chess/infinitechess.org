// src/client/scripts/esm/game/boardeditor/actions/esave.ts

/**
 * Handles the saving of positions in boardeditor
 */

import type { EditorSaveState } from '../editortypes';

import toast from '../../gui/toast';
import eactions from './eactions';
import eautosave from './eautosave';
import egamerules from '../egamerules';
import esavestore from '../../editorstores/esavestore';
import boardeditor from '../boardeditor';

// State --------------------------------------------------------------------

/** Prevent overlapping IndexedDB saves (single-flight): is save ongoing */
let positionSaveInFlight = false;
/** Prevent overlapping IndexedDB writes (single-flight): is save pending */
let positionSavePending = false;

// Actions ----------------------------------------------------------------------

/** Saves current position under "position_name". */
async function saveLocal(position_name: string): Promise<void> {
	if (!boardeditor.areInBoardEditor()) return;

	// Coalesce: if a save is already running, request another and return.
	if (positionSaveInFlight) {
		positionSavePending = true;
		return;
	}

	positionSaveInFlight = true;
	positionSavePending = false;

	try {
		const variantOptions = eactions.getCurrentPositionInformation(false);
		const { pawnDoublePush, castling } = egamerules.getPositionDependentGameRules();
		const timestamp = Date.now();
		const piece_count = variantOptions.position.size;

		await esavestore.saveState({
			position_name,
			timestamp,
			piece_count,
			variantOptions,
			pawnDoublePush,
			castling,
		});
	} catch (err) {
		// Don't crash the editor over failed save
		console.error('Failed to save board editor position:', err);
	} finally {
		positionSaveInFlight = false;

		// If something changed while saving, immediately save again (latest wins).
		if (positionSavePending) {
			positionSavePending = false;
			await saveLocal(position_name);
		} else {
			boardeditor.markPositionClean();
			eautosave.markPositionDirty();
			void eautosave.autosaveCurrentPositionOnce();
			toast.show(translations.editor.saved_in_browser);
		}
	}
}

/**
 * Reads a locally saved position from IndexedDB.
 * Shows the position_corrupted toast on failure.
 * @returns An EditorSaveState on success, undefined on failure.
 */
async function readLocal(position_name: string): Promise<EditorSaveState | undefined> {
	try {
		return await esavestore.readLocal(position_name);
	} catch {
		toast.show(translations.editor.position_corrupted, { error: true });
		return undefined;
	}
}

// Exports --------------------------------------------------------------------

export default {
	saveLocal,
	readLocal,
};
