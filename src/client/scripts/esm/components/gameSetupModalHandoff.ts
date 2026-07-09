// src/client/scripts/esm/components/gameSetupModalHandoff.ts

/**
 * Cross-page handoff for pre-filling the lobby's game setup modal.
 *
 * The analysis page's "continue from here" flow can't host the game setup modal
 * itself, so it stashes the exported position + intended mode here and navigates
 * to the home page (lobby), which consumes it on load to auto-open the modal.
 * IndexedDB (not localStorage) because exported positions can exceed 1MB.
 */

import IndexedDB from '../util/IndexedDB.js';

// Types ------------------------------------------------------------------

/** The game creation flow the modal opens into. `online` is a public lobby seek. */
export type ModalMode = 'online' | 'friend' | 'computer';

/** A pending game-setup seed handed off from another page. */
export interface GameSetupHandoff {
	/** ICN of the position to pre-fill into the modal's Custom From-ICN field. */
	icn: string;
	/** Which game creation flow to open the modal into. */
	mode: ModalMode;
}

// Constants --------------------------------------------------------------

/** IndexedDB key the handoff is stashed under. */
const HANDOFF_KEY = 'game-setup-handoff';

/** How long a stashed handoff stays valid before being auto-discarded. */
const EXPIRY_MILLIS = 1000 * 60 * 5; // 5 minutes

// Functions --------------------------------------------------------------

/** Stashes a handoff for the lobby to consume on its next load. */
async function save(handoff: GameSetupHandoff): Promise<void> {
	await IndexedDB.saveItem(HANDOFF_KEY, handoff, EXPIRY_MILLIS);
}

/** Consumes (reads and clears) a pending handoff, or undefined if there is none. */
async function take(): Promise<GameSetupHandoff | undefined> {
	const handoff = await IndexedDB.loadItem<GameSetupHandoff>(HANDOFF_KEY);
	if (handoff !== undefined) await IndexedDB.deleteItem(HANDOFF_KEY);
	return handoff;
}

export default { save, take };
