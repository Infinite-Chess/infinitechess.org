// src/client/scripts/esm/game/boardeditor/eautosave.ts

/**
 * This script handles autosaving the board editor position
 * It autosaves periodically, but only if the position is dirty, aka if it has changed since last time.
 * It also autosaves when leaving the editor
 */

import IndexedDB from '../../util/IndexedDB';
import boardeditor from './boardeditor';
import eactions from './eactions';
import egamerules from './egamerules';

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
		const variantOptions = eactions.getCurrentPositionInformation();
		const { pawnDoublePush, castling } = egamerules.getPositionDependentGameRules();
		const positionname = boardeditor.getActivePositionName();
		const timestamp = Date.now();
		const pieceCount = variantOptions.position.size;

		await IndexedDB.saveItem('editor-autosave', {
			positionname,
			timestamp,
			pieceCount,
			variantOptions,
			pawnDoublePush,
			castling,
		});

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
	stopPositionAutosave(); // safety to avoid double intervals

	// Do an initial save after init (for safety)
	positionDirty = true;
	void autosaveCurrentPositionOnce();

	positionAutosaveTimer = window.setInterval(() => {
		// Don't save if editor is closed mid-tick
		if (!boardeditor.areInBoardEditor()) return;

		void autosaveCurrentPositionOnce();
	}, positionAutosaveIntervalMillis);

	// Save when leaving the page
	window.addEventListener('beforeunload', onPageUnload);
}

/** Kill running autosave interval */
function stopPositionAutosave(): void {
	if (positionAutosaveTimer !== undefined) {
		clearInterval(positionAutosaveTimer);
		positionAutosaveTimer = undefined;
	}

	window.removeEventListener('beforeunload', onPageUnload);
}

function onPageUnload(): void {
	// Do a final save when leaving the page
	positionDirty = true;
	void autosaveCurrentPositionOnce();
}

export default {
	markPositionDirty,
	startPositionAutosave,
	autosaveCurrentPositionOnce,
	stopPositionAutosave,
};
