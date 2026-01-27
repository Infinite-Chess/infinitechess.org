// src/client/scripts/esm/game/boardeditor/actions/save.ts

/**
 * Handles the saving of positions in boardeditor
 */

import type { VariantOptions } from '../../../../../../shared/chess/logic/initvariant';

import IndexedDB from '../../../util/IndexedDB';
import boardeditor from '../boardeditor';
import eactions from './eactions';
import egamerules from '../egamerules';
// @ts-ignore
import statustext from '../../gui/statustext';

// Types ------------------------------------------------------------------

/** Minimal information about a saved position */
interface EditorAbridgedSaveState {
	positionname: string;
	timestamp: number;
	pieceCount: number;
}

/** Complete information about a saved position */
interface EditorSaveState extends EditorAbridgedSaveState {
	variantOptions: VariantOptions;
	pawnDoublePush?: boolean;
	castling?: boolean;
}

// Constants ----------------------------------------------------------------------

/** Max allowed length of the name of a position */
const POSITION_NAME_MAX_LENGTH = 24;

/** Prefix for editor saves in local storage */
const EDITOR_SAVE_PREFIX = 'editor-save-';

/** Prefix for editor saveinfo in local storage */
const EDITOR_SAVEINFO_PREFIX = 'editor-saveinfo-';

// Variables --------------------------------------------------------------------

/** Prevent overlapping IndexedDB saves (single-flight): is save ongoing */
let positionSaveInFlight = false;
/** Prevent overlapping IndexedDB writes (single-flight): is save pending */
let positionSavePending = false;

// Actions ----------------------------------------------------------------------

/** Saves current position under "positionname". */
async function save(positionname: string): Promise<void> {
	if (!boardeditor.areInBoardEditor()) return;

	// Coalesce: if a save is already running, request another and return.
	if (positionSaveInFlight) {
		positionSavePending = true;
		return;
	}

	positionSaveInFlight = true;
	positionSavePending = false;

	try {
		const variantOptions = eactions.getCurrentPositionInformation();
		const { pawnDoublePush, castling } = egamerules.getPositionDependentGameRules();
		const timestamp = Date.now();
		const pieceCount = variantOptions.position.size;

		// Save full info for loading purposes
		await IndexedDB.saveItem(`${EDITOR_SAVE_PREFIX}${positionname}`, {
			positionname,
			timestamp,
			pieceCount,
			variantOptions,
			pawnDoublePush,
			castling,
		});

		// Save abridged info for display purposes
		await IndexedDB.saveItem(`${EDITOR_SAVEINFO_PREFIX}${positionname}`, {
			positionname,
			timestamp,
			pieceCount,
		});
	} catch (err) {
		// Don't crash the editor over failed save
		console.error('Failed to save board editor position:', err);
	} finally {
		positionSaveInFlight = false;

		// If something changed while saving, immediately save again (latest wins).
		if (positionSavePending) {
			positionSavePending = false;
			await save(positionname);
		} else {
			boardeditor.setActivePositionName(positionname);
			statustext.showStatus('Position successfully saved on browser.');
		}
	}
}

// Exports --------------------------------------------------------------------

export default {
	POSITION_NAME_MAX_LENGTH,
	EDITOR_SAVE_PREFIX,
	EDITOR_SAVEINFO_PREFIX,

	save,
};

export type { EditorAbridgedSaveState, EditorSaveState };
