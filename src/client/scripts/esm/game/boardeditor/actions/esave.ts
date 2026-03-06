// src/client/scripts/esm/game/boardeditor/actions/esave.ts

/**
 * Handles the saving of positions in boardeditor
 */

import type { EditorAbridgedSaveState, EditorSaveState } from '../editortypes';

import toast from '../../gui/toast';
import eactions from './eactions';
import IndexedDB from '../../../util/IndexedDB';
import eautosave from './eautosave';
import egamerules from '../egamerules';
import editortypes from '../editortypes';
import boardeditor from '../boardeditor';

// Constants ----------------------------------------------------------------------

/** Prefix for editor saves in local storage */
const EDITOR_SAVE_PREFIX = 'editor-save-' as const;

/** Prefix for editor saveinfo in local storage */
const EDITOR_SAVEINFO_PREFIX = 'editor-saveinfo-' as const;

// State --------------------------------------------------------------------

/** Prevent overlapping IndexedDB saves (single-flight): is save ongoing */
let positionSaveInFlight = false;
/** Prevent overlapping IndexedDB writes (single-flight): is save pending */
let positionSavePending = false;

// Helpers ----------------------------------------------------------------------

/** Returns the IndexedDB key for the full save data of a position. */
function saveKey(position_name: string): string {
	return `${EDITOR_SAVE_PREFIX}${position_name}`;
}

/** Returns the IndexedDB key for the abridged save info of a position. */
function saveinfoKey(position_name: string): string {
	return `${EDITOR_SAVEINFO_PREFIX}${position_name}`;
}

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

		await saveState({
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
			toast.show('Position saved in browser.');
		}
	}
}

/**
 * Persists a fully constructed SaveState to IndexedDB.
 * Writes both the full save (for loading) and the abridged save (for display).
 */
async function saveState(editorSaveState: EditorSaveState): Promise<void> {
	const { position_name, timestamp, piece_count } = editorSaveState;
	await Promise.all([
		// Save full info for loading purposes
		IndexedDB.saveItem(saveKey(position_name), editorSaveState),
		// Save abridged info for display purposes
		IndexedDB.saveItem(saveinfoKey(position_name), {
			position_name,
			timestamp,
			piece_count,
		}),
	]);
}

/** Deletes a locally saved position from IndexedDB. */
async function deleteLocal(position_name: string): Promise<void> {
	await Promise.all([
		IndexedDB.deleteItem(saveinfoKey(position_name)),
		IndexedDB.deleteItem(saveKey(position_name)),
	]);
}

/** Returns true if a local save exists for the given position name. */
async function localSaveExists(position_name: string): Promise<boolean> {
	const raw = await IndexedDB.loadItem(saveinfoKey(position_name));
	return editortypes.AbridgedSaveStateSchema.safeParse(raw).success;
}

/**
 * Returns an array of all abridged save states stored locally.
 * Deletes and logs any corrupted entries.
 */
async function getAllLocalSaveInfos(): Promise<EditorAbridgedSaveState[]> {
	const saveinfo_keys = (await IndexedDB.getAllKeys()).filter((key) =>
		key.startsWith(EDITOR_SAVEINFO_PREFIX),
	);
	const results = await Promise.all(
		saveinfo_keys.map(async (key) => {
			const raw = await IndexedDB.loadItem(key);
			const parsed = editortypes.AbridgedSaveStateSchema.safeParse(raw);
			if (!parsed.success) {
				const position_name = key.slice(EDITOR_SAVEINFO_PREFIX.length);
				console.error(
					`Corrupted local save "${position_name}" found, deleting it. Error: ${parsed.error}`,
				);
				await deleteLocal(position_name);
				return undefined;
			}
			return parsed.data;
		}),
	);
	return results.filter((x) => x !== undefined);
}

/**
 * Reads a locally saved position from IndexedDB.
 * @returns An EditorSaveState on success, undefined if not found or corrupted.
 */
async function readLocal(position_name: string): Promise<EditorSaveState | undefined> {
	const editorSaveStateRaw = await IndexedDB.loadItem(saveKey(position_name));
	const editorSaveStateParsed = editortypes.SaveStateSchema.safeParse(editorSaveStateRaw);
	if (!editorSaveStateParsed.success) {
		console.error(
			`Corrupted local save "${position_name}" found. Error: ${editorSaveStateParsed.error}`,
		);
		toast.show(`The position was corrupted.`, { error: true });
		return;
	}
	return editorSaveStateParsed.data;
}

// Exports --------------------------------------------------------------------

export default {
	saveLocal,
	saveState,
	deleteLocal,
	readLocal,
	localSaveExists,
	getAllLocalSaveInfos,
};
