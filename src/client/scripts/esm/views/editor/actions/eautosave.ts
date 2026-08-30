// src/client/scripts/esm/views/editor/actions/eautosave.ts

/**
 * This script handles autosaving the board editor position
 * It autosaves periodically, but only if the position is dirty, aka if it has changed since last time.
 */

import type { ActivePosition } from '../boardeditor';
import type { EditorPositionData } from '../../../savedpositions/storetypes';

import z from 'zod';

import eactions from './eactions';
import IndexedDB from '../../../util/IndexedDB';
import egamerules from '../egamerules';
import storetypes from '../../../savedpositions/storetypes';
import boardeditor from '../boardeditor';
import validatorama from '../../../util/validatorama';

// Types -----------------------------------------------------------------------

/**
 * Complete save state as written by the autosave.
 * active_position is optional because the user may not have a named/saved position open.
 */
export interface EditorAutosaveState extends EditorPositionData {
	active_position?: ActivePosition;
	/** Whether the position has unsaved changes. */
	dirty: boolean;
}

// Constants -------------------------------------------------------------------

/** Name of the IndexedDB key for the board editor autosave. */
const EDITOR_AUTOSAVE_NAME = 'infinitechess-boardeditor-autosave';

/** Schema for validating an AutosaveState */
const AutosaveStateSchema = z.strictObject({
	active_position: z
		.union([
			z.object({ name: z.string(), storage_type: z.literal('local') }),
			z.object({ name: z.string(), storage_type: z.literal('cloud'), owner: z.string() }),
		])
		.optional(),
	dirty: z.boolean(),
	...storetypes.positionDataFields,
}) satisfies z.ZodType<EditorAutosaveState>;

// Variables -------------------------------------------------------------------

/** Number of milliseconds for period of position autosave */
const AUTOSAVE_INTERVAL_MS = 10000;

/** Interval object for position autosave */
let positionAutosaveTimer: number | undefined;

/** Prevent overlapping IndexedDB writes (single-flight): is autosave ongoing */
let positionAutosaveInFlight = false;
/** Prevent overlapping IndexedDB writes (single-flight): is autosave pending */
let positionAutosavePending = false;

/** Track whether anything changed since last save */
let positionDirty = true;

// Functions -------------------------------------------------------------------

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
			dirty: boardeditor.isPositionDirty(),
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

	positionAutosaveTimer = window.setInterval(
		() => autosaveCurrentPositionOnce(),
		AUTOSAVE_INTERVAL_MS,
	);
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
 * Returns undefined if no autosave exists.
 * Clears and returns undefined if the data is corrupted or if the active
 * position is a cloud save owned by a different user (e.g. after logout or
 * account switch).
 */
async function loadAutosave(): Promise<EditorAutosaveState | undefined> {
	const raw = await IndexedDB.loadItem(EDITOR_AUTOSAVE_NAME);
	if (raw === undefined) return undefined;
	const parsed = AutosaveStateSchema.safeParse(raw);
	if (!parsed.success) {
		console.error('Corrupted board editor autosave data found, clearing autosave.');
		clearAutosave();
		return undefined;
	}

	// If the autosave belongs to a cloud save owned by a different user, discard it.
	// Prevents accidentally trying to save the posiiton to a user that isn't logged in.
	const ap = parsed.data.active_position;
	if (ap?.storage_type === 'cloud' && ap.owner !== validatorama.getOurUsername()) {
		console.log('Clearing editor auto save from a different user.');
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
