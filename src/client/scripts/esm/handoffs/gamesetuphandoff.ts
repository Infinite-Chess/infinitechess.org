// src/client/scripts/esm/handoffs/gamesetuphandoff.ts

/**
 * Cross-page handoff for pre-filling the lobby's game setup modal.
 *
 * The analysis page's "continue from here" flow can't host the game setup modal
 * itself, so it stashes the exported position + intended mode here and navigates
 * to the home page (lobby), which consumes it on load to auto-open the modal.
 */

import { createHandoff } from './createhandoff.js';

// Types -----------------------------------------------------------------------

/** The game creation flow the modal opens into. `online` is a public lobby seek. */
export type ModalMode = 'online' | 'friend' | 'computer';

/** A pending game-setup seed handed off from another page. */
interface GameSetupHandoff {
	/** ICN of the position to pre-fill into the modal's Custom From-ICN field. */
	icn: string;
	/** Which game creation flow to open the modal into. */
	mode: ModalMode;
}

// Constants -------------------------------------------------------------------

/** How long a stashed handoff stays valid before being auto-discarded. */
const EXPIRY_MS = 1000 * 60 * 5; // 5 minutes

// Exports ---------------------------------------------------------------------

export default createHandoff<GameSetupHandoff>('game-setup-handoff', EXPIRY_MS);
