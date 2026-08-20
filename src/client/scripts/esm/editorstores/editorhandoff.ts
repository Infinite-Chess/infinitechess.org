// src/client/scripts/esm/editorstores/editorhandoff.ts

/**
 * Cross-page handoff for opening a position in the board editor.
 *
 * Any page offering an "open this in the editor" action stashes the position
 * here and navigates to /editor, which consumes it on load in preference to
 * its own autosave.
 * IndexedDB (not localStorage) because positions can exceed 1MB.
 */

import type { VariantOptions } from '../../../../shared/chess/logic/gamefile.js';

import IndexedDB from '../util/IndexedDB.js';

// Types ------------------------------------------------------------------

/** A pending position handed off to the board editor from another page. */
export interface EditorHandoff {
	/** The position for the editor to open, in place of its autosave. */
	variantOptions: VariantOptions;
}

// Constants --------------------------------------------------------------

/** IndexedDB key the handoff is stashed under. */
const HANDOFF_KEY = 'board-editor-handoff';

/** How long a stashed handoff stays valid before being auto-discarded. */
const EXPIRY_MILLIS = 1000 * 60 * 5; // 5 minutes

// Functions --------------------------------------------------------------

/** Stashes a handoff for the board editor to consume on its next load. */
async function save(handoff: EditorHandoff): Promise<void> {
	await IndexedDB.saveItem(HANDOFF_KEY, handoff, EXPIRY_MILLIS);
}

/** Consumes (reads and clears) a pending handoff, or undefined if there is none. */
async function take(): Promise<EditorHandoff | undefined> {
	const handoff = await IndexedDB.loadItem<EditorHandoff>(HANDOFF_KEY);
	if (handoff !== undefined) await IndexedDB.deleteItem(HANDOFF_KEY);
	return handoff;
}

export default { save, take };
