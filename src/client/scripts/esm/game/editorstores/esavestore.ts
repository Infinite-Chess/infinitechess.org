// src/client/scripts/esm/game/editorstores/esavestore.ts

/**
 * Low-level IndexedDB read/write operations for board editor saves.
 */

import type { EditorAbridgedSaveState, EditorSaveState } from '../boardeditor/editortypes.js';

import IndexedDB from '../../util/IndexedDB.js';
import editortypes from '../boardeditor/editortypes.js';

// Constants ----------------------------------------------------------------------

/** Prefix for editor saves in IndexedDB */
const EDITOR_SAVE_PREFIX = 'editor-save-' as const;

/** Prefix for editor saveinfo in IndexedDB */
const EDITOR_SAVEINFO_PREFIX = 'editor-saveinfo-' as const;

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
				return;
			}
			return parsed.data;
		}),
	);
	return results.filter((x) => x !== undefined);
}

/**
 * Reads a locally saved position from IndexedDB.
 * @throws If not found.
 * @throws If the stored data fails schema validation (corrupted).
 */
async function readLocal(position_name: string): Promise<EditorSaveState> {
	const editorSaveStateRaw = await IndexedDB.loadItem(saveKey(position_name));
	if (editorSaveStateRaw === undefined)
		throw new Error(`Local save "${position_name}" not found`);
	const editorSaveStateParsed = editortypes.SaveStateSchema.safeParse(editorSaveStateRaw);
	if (!editorSaveStateParsed.success) {
		console.error(
			`Corrupted local save "${position_name}" found. Error: ${editorSaveStateParsed.error}`,
		);
		throw new Error(`Corrupted local save "${position_name}"`);
	}
	return editorSaveStateParsed.data;
}

// Exports --------------------------------------------------------------------

export default {
	saveState,
	deleteLocal,
	localSaveExists,
	getAllLocalSaveInfos,
	readLocal,
};
