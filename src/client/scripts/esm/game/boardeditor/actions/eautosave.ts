// src/client/scripts/esm/game/boardeditor/actions/eautosave.ts

/**
 * This script handles autosaving the board editor position
 * It autosaves periodically, but only if the position is dirty, aka if it has changed since last time.
 */

import type { EditorAutosaveState } from '../editortypes';

import eactions from './eactions';
import IndexedDB from '../../../util/IndexedDB';
import egamerules from '../egamerules';
import boardeditor from '../boardeditor';
import editortypes from '../editortypes';

// Constants -------------------------------------------------------------

/** Name of editor autosave in local storage */
const EDITOR_AUTOSAVE_NAME = 'editor-autosave';

// Variables --------------------------------------------------------------

/** Number of milliseconds for period of position autosave */
const positionAutosaveIntervalMillis = 10000;

/** Interval object for position autosave */
let positionAutosaveTimer: number | undefined;

/** Prevent overlapping IndexedDB writes (single-flight): is autosave ongoing */
let positionAutosaveInFlight = false;
/** Prevent overlapping IndexedDB writes (single-flight): is autosave pending */
let positionAutosavePending = false;

/** Track whether anything changed since last save */
let positionDirty = true;

// Functions --------------------------------------------------------------

/**
 * Mark position as needing save.
 * This is called when the position or the game rules change.
 */
function markPositionDirty(): void {
	positionDirty = true;
}

/** Auto saves the board editor position once. */
async function autosaveCurrentPositionOnce(): Promise<void> {
	// Track dirtiness: skip unnecessary writes that don't change anything
	if (!positionDirty) return;

	// Coalesce: if a save is already running, request another and return.
	if (positionAutosaveInFlight) {
		positionAutosavePending = true;
		return;
	}

	positionAutosaveInFlight = true;
	positionAutosavePending = false;

	try {
		const variantOptions = eactions.getCurrentPositionInformation(false);
		const { pawnDoublePush, castling } = egamerules.getPositionDependentGameRules();

		await IndexedDB.saveItem(EDITOR_AUTOSAVE_NAME, {
			active_position: boardeditor.getActivePosition(),
			timestamp: Date.now(),
			piece_count: variantOptions.position.size,
			variantOptions,
			pawnDoublePush,
			castling,
		} satisfies EditorAutosaveState);

		positionDirty = false;
	} catch (err) {
		// Don't crash the editor over failed autosave
		console.error('Failed to autosave board editor position:', err);
	} finally {
		positionAutosaveInFlight = false;

		// If something changed while saving, immediately save again (latest wins).
		if (positionAutosavePending) {
			positionAutosavePending = false;
			// Mark dirty because we want to flush latest state.
			positionDirty = true;
			// Fire and forget; caller doesn't need to await.
			void autosaveCurrentPositionOnce();
		}
	}
}

/** Initialize new autosave interval */
function startPositionAutosave(): void {
	stopPositionAutosave(); // Stop existing interval if we opened a new save

	// Do an initial save after init (for safety)
	positionDirty = true;
	void autosaveCurrentPositionOnce();

	positionAutosaveTimer = window.setInterval(() => {
		// Don't save if editor is closed mid-tick
		if (!boardeditor.areInBoardEditor()) return;

		void autosaveCurrentPositionOnce();
	}, positionAutosaveIntervalMillis);
}

/** Kill running autosave interval */
function stopPositionAutosave(): void {
	if (positionAutosaveTimer !== undefined) {
		clearInterval(positionAutosaveTimer);
		positionAutosaveTimer = undefined;
	}
}

function clearAutosave(): void {
	IndexedDB.deleteItem(EDITOR_AUTOSAVE_NAME).catch((err) => {
		console.error('Failed to clear board editor autosave:', err);
	});
}

/**
 * Reads and validates the autosave from IndexedDB.
 * Clears and returns undefined if the data is corrupted.
 * Returns undefined if no autosave exists.
 */
async function loadAutosave(): Promise<EditorAutosaveState | undefined> {
	const raw = await IndexedDB.loadItem(EDITOR_AUTOSAVE_NAME);
	if (raw === undefined) return undefined;
	const parsed = editortypes.AutosaveStateSchema.safeParse(raw);
	if (!parsed.success) {
		console.error('Corrupted board editor autosave data found, clearing autosave.');
		clearAutosave();
		return undefined;
	}
	return parsed.data;
}

export default {
	markPositionDirty,
	startPositionAutosave,
	autosaveCurrentPositionOnce,
	stopPositionAutosave,
	clearAutosave,
	loadAutosave,
};
