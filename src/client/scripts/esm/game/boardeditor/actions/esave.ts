// src/client/scripts/esm/game/boardeditor/actions/esave.ts

/**
 * Handles the saving of positions in boardeditor
 */

import type { VariantOptions } from '../../../../../../shared/chess/logic/initvariant';

import * as z from 'zod';

import toast from '../../gui/toast';
import eactions from './eactions';
import IndexedDB from '../../../util/IndexedDB';
import egamerules from '../egamerules';
import boardeditor from '../boardeditor';

// Types ------------------------------------------------------------------

/** Minimal information about a saved position */
interface EditorAbridgedSaveState {
	position_name?: string;
	timestamp: number;
	piece_count: number;
}

/** Complete information about a saved position */
interface EditorSaveState extends EditorAbridgedSaveState {
	variantOptions: VariantOptions;
	pawnDoublePush?: boolean;
	castling?: boolean;
}

// Constants ----------------------------------------------------------------------

/** Prefix for editor saves in local storage */
const EDITOR_SAVE_PREFIX = 'editor-save-' as const;

/** Prefix for editor saveinfo in local storage */
const EDITOR_SAVEINFO_PREFIX = 'editor-saveinfo-' as const;

// Zod Schemas --------------------------------------------------------------------

/** Schema for validating an EditorAbridgedSaveState */
const EditorAbridgedSaveStateSchema = z.strictObject({
	position_name: z.string().min(1, 'Position name is required').optional(),
	timestamp: z.number(),
	piece_count: z.number().int('Piece count must be an integer'),
});

/** Schema for validating an EditorSaveState */
const EditorSaveStateSchema = EditorAbridgedSaveStateSchema.extend({
	variantOptions: z
		.object()
		.loose()
		.transform((v) => v as unknown as VariantOptions), // Workaround, for lack of VariantOptions schema
	pawnDoublePush: z.boolean().optional(),
	castling: z.boolean().optional(),
});

// Variables --------------------------------------------------------------------

/** Prevent overlapping IndexedDB saves (single-flight): is save ongoing */
let positionSaveInFlight = false;
/** Prevent overlapping IndexedDB writes (single-flight): is save pending */
let positionSavePending = false;

// Actions ----------------------------------------------------------------------

/** Saves current position under "positionname". */
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
			boardeditor.setActivePositionName(position_name);
			toast.show('Position successfully saved in browser.');
		}
	}
}

/**
 * Persists a fully constructed EditorSaveState to IndexedDB.
 * Writes both the full save (for loading) and the abridged save (for display).
 */
async function saveState(editorSaveState: EditorSaveState): Promise<void> {
	const { position_name, timestamp, piece_count } = editorSaveState;
	await Promise.all([
		// Save full info for loading purposes
		IndexedDB.saveItem(`${EDITOR_SAVE_PREFIX}${position_name}`, editorSaveState),
		// Save abridged info for display purposes
		IndexedDB.saveItem(`${EDITOR_SAVEINFO_PREFIX}${position_name}`, {
			position_name,
			timestamp,
			piece_count,
		}),
	]);
}

/** Deletes a locally saved position from IndexedDB. */
async function deleteLocal(position_name: string): Promise<void> {
	await Promise.all([
		IndexedDB.deleteItem(`${EDITOR_SAVEINFO_PREFIX}${position_name}`),
		IndexedDB.deleteItem(`${EDITOR_SAVE_PREFIX}${position_name}`),
	]);
}

/** Returns true if a local save exists for the given position name. */
async function localSaveExists(position_name: string): Promise<boolean> {
	const saveinfo_key = `${EDITOR_SAVEINFO_PREFIX}${position_name}`;
	const raw = await IndexedDB.loadItem(saveinfo_key);
	return EditorAbridgedSaveStateSchema.safeParse(raw).success;
}

/**
 * Returns an array of all abridged save states stored locally.
 * Skips and logs any corrupted entries.
 */
async function getAllLocalSaveInfos(): Promise<EditorAbridgedSaveState[]> {
	const saveinfo_keys = (await IndexedDB.getAllKeys()).filter((key) =>
		key.startsWith(EDITOR_SAVEINFO_PREFIX),
	);
	const results = await Promise.all(
		saveinfo_keys.map(async (key) => {
			const raw = await IndexedDB.loadItem(key);
			const parsed = EditorAbridgedSaveStateSchema.safeParse(raw);
			if (!parsed.success) {
				console.error(
					`Invalid EditorAbridgedSaveState "${key}" in IndexedDB: ${parsed.error}`,
				);
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
	const save_key = `${EDITOR_SAVE_PREFIX}${position_name}`;
	const editorSaveStateRaw = await IndexedDB.loadItem(save_key);
	const editorSaveStateParsed = EditorSaveStateSchema.safeParse(editorSaveStateRaw);
	if (!editorSaveStateParsed.success) {
		console.error(
			`Invalid EditorSaveState ${save_key} in IndexedDB ${editorSaveStateParsed.error}`,
		);
		toast.show(`The position was corrupted.`, { error: true });
		return;
	}
	return editorSaveStateParsed.data;
}

// Exports --------------------------------------------------------------------

export default {
	EditorSaveStateSchema,

	saveLocal,
	saveState,
	deleteLocal,
	readLocal,
	localSaveExists,
	getAllLocalSaveInfos,
};

export type { EditorAbridgedSaveState, EditorSaveState };
