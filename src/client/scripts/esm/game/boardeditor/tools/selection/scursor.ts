// src/client/scripts/esm/game/boardeditor/tools/selection/scursor.ts

/**
 * Selection Tool Cursor Style
 *
 * Handles changing the current cursor style of the canvas overlay
 * when hovering over the selection area's edges or fill handle.
 */

import game from '../../../chess/game';

type Cursor = 'grab' | 'grabbing' | 'crosshair';

// Constants ------------------------------------------------

/** If multiple cursor styles are enabled, only the one with most priority is actually applied. */
const priority: Cursor[] = ['crosshair', 'grabbing', 'grab'];

// State ----------------------------------------------------

/** A list of all active cursor styles. */
const current: Set<Cursor> = new Set();

// Methods --------------------------------------------------

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

/** Updates the current cursor style, if needed, to the highest priority active style. */
function updateCursor(): void {
	const overlay = game.getOverlay();

	// Set cursor to default if no cursor styles are active
	if (current.size === 0) {
		overlay.style.cursor = 'default';
		return;
	}

	// Determine highest priority cursor style
	let highestPrio: string;
	for (const prioCursor of priority) {
		if (current.has(prioCursor)) {
			highestPrio = prioCursor;
			break;
		}
	}

	if (overlay.style.cursor === highestPrio!) return; // No change needed

	overlay.style.cursor = highestPrio!; // Apply new cursor style
}

// Exports ---------------------------------------------------

export default {
	addCursor,
	removeCursor,
};
