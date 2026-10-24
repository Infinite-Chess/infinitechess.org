// src/client/scripts/handoffs/gamesetuphandoff.ts

/**
 * Cross-page handoff for pre-filling the lobby's game setup modal.
 *
 * The analysis page's "continue from here" flow can't host the game setup modal
 * itself, so it stashes the exported position + intended mode here and navigates
 * to the home page (lobby), which consumes it on load to auto-open the modal.
 */

import * as z from 'zod';

import timeutil from '../../../shared/util/timeutil.js';

import { createHandoff } from './createhandoff.js';

// Constants -------------------------------------------------------------------

/** How long a stashed handoff stays valid before being auto-discarded. */
const EXPIRY_MS = timeutil.toMillis(5, 'minutes');

// Schemas ---------------------------------------------------------------------

/** The game creation flow the modal opens into. `online` is a public lobby seek. */
export type ModalMode = z.infer<typeof ModalModeSchema>;
const ModalModeSchema = z.enum(['online', 'friend', 'computer']);

/** A pending game-setup seed handed off from another page. */
const GameSetupHandoffSchema = z.strictObject({
	/** ICN of the position to pre-fill into the modal's Custom From-ICN field. */
	icn: z.string(),
	/** Which game creation flow to open the modal into. */
	mode: ModalModeSchema,
});

// Exports ---------------------------------------------------------------------

export default createHandoff('game-setup-handoff', EXPIRY_MS, GameSetupHandoffSchema);
