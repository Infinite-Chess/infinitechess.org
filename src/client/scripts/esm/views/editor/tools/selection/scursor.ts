// src/client/scripts/esm/views/editor/tools/selection/scursor.ts

/**
 * Selection Tool Cursor Style
 *
 * Handles changing the current cursor style of the board canvas
 * when hovering over the selection area's edges or fill handle.
 */

import listeners from '../../../../game/listeners.js';

// Types -----------------------------------------------------------------------

type Cursor = 'grab' | 'grabbing' | 'crosshair';

// Constants -------------------------------------------------------------------

/** If multiple cursor styles are enabled, only the one with most priority is actually applied. */
const PRIORITY: Cursor[] = ['crosshair', 'grabbing', 'grab'];

// State -----------------------------------------------------------------------

/** A list of all active cursor styles. */
const current: Set<Cursor> = new Set();

// Functions -------------------------------------------------------------------

/** Adds a cursor style, immediately applying it if it has the highest priority. */
function addCursor(cursor: Cursor): void {
	current.add(cursor);
	updateCursor();
}

/** Removes a cursor style, updating the current style to the next highest priority if needed. */
function removeCursor(cursor: Cursor): void {
	current.delete(cursor);
	updateCursor();
}

/** Applies the highest priority active cursor style, or the default if none are active. */
function updateCursor(): void {
	const canvas = listeners.getCanvas();
	const highestPrio = PRIORITY.find((cursor) => current.has(cursor)) ?? 'default';
	if (canvas.style.cursor !== highestPrio) canvas.style.cursor = highestPrio;
}

// Exports ---------------------------------------------------------------------

export default {
	addCursor,
	removeCursor,
};
