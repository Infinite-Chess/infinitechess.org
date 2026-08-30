// src/client/scripts/esm/handoffs/editorhandoff.ts

/**
 * Cross-page handoff for opening a position in the board editor.
 *
 * Any page offering an "open this in the editor" action stashes the position
 * here and navigates to /editor, which consumes it on load in preference to
 * its own autosave.
 */

import type { VariantOptions } from '../../../../shared/chess/logic/gamefile.js';

import { createHandoff } from './createhandoff.js';

// Types -----------------------------------------------------------------------

/** A pending position handed off to the board editor from another page. */
interface EditorHandoff {
	/** The position for the editor to open, in place of its autosave. */
	variantOptions: VariantOptions;
}

// Constants -------------------------------------------------------------------

/** How long a stashed handoff stays valid before being auto-discarded. */
const EXPIRY_MS = 1000 * 60 * 5; // 5 minutes

// Exports ---------------------------------------------------------------------

export default createHandoff<EditorHandoff>('board-editor-handoff', EXPIRY_MS);
