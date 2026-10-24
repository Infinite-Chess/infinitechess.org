// src/client/scripts/handoffs/editorhandoff.ts

/**
 * Cross-page handoff for opening a position in the board editor.
 *
 * Any page offering an "open this in the editor" action stashes the position
 * here and navigates to /editor, which consumes it on load in preference to
 * its own autosave.
 */

import type { VariantOptions } from '../../../shared/chess/logic/gamefile.js';

import * as z from 'zod';

import timeutil from '../../../shared/util/timeutil.js';

import { createHandoff } from './createhandoff.js';

// Constants -------------------------------------------------------------------

/** How long a stashed handoff stays valid before being auto-discarded. */
const EXPIRY_MS = timeutil.toMillis(5, 'minutes');

// Schemas ---------------------------------------------------------------------

/**
 * The position for the editor to open, in place of its autosave. Checked for object-ness
 * only: it can hold millions of pieces, and walking them would freeze the page.
 */
const EditorHandoffSchema = z.custom<VariantOptions>((v) => typeof v === 'object' && v !== null);

// Exports ---------------------------------------------------------------------

export default createHandoff('board-editor-handoff', EXPIRY_MS, EditorHandoffSchema);
