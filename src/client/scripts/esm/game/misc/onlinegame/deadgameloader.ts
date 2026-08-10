// src/client/scripts/esm/game/misc/onlinegame/deadgameloader.ts

/**
 * The dead/review load path: fetches a concluded game's {@link DeadGameState} over HTTP, parses its
 * ICN for the move list, normalizes it into the same `gamestate` shape the live path builds, and
 * hands it to the shared loader — no socket opened.
 */

import type { DeadGameState } from '../../../../../../shared/domain.js';
import type { GameStateMessage } from '../../../../../../shared/clientbound.js';

import uuid from '../../../../../../shared/util/uuid.js';
import icnimport from '../../../../../../shared/chess/logic/icn/icnimport.js';
import icnconverter from '../../../../../../shared/chess/logic/icn/icnconverter.js';

import toast from '../../../components/toast.js';
import onlinegame from './onlinegame.js';

/** Fetches and loads the dead game named by the page URL. */
async function loadDeadGame(): Promise<void> {
	try {
		const deadState: DeadGameState = await fetchDeadState();
		const gameState = normalizeToGameState(deadState);
		onlinegame.loadGameFromState(gameState, true);
	} catch (e: unknown) {
		console.error('Failed to fetch dead game state:', e);
		toast.show('Failed to load game. Please refresh.', { error: true });
	}
}

/**
 * Fetches the `DeadGameState`.
 * @throws If the fetch fails, or the server returns
 * a non-OK response, or the JSON body is malformed.
 */
async function fetchDeadState(): Promise<DeadGameState> {
	const response = await fetch(`/api/game/${uuid.base10ToBase62(window.gamePageData.id)}`);
	if (!response.ok) throw new Error(`Game fetch failed (${response.status})`);
	return await response.json();
}

/** Normalizes a `DeadGameState` into the live `gamestate` shape the loader consumes. */
function normalizeToGameState(deadState: DeadGameState): GameStateMessage {
	// Parse the ICN for the move list.
	const longformat = icnconverter.ShortToLong_Format(deadState.icn);

	const state: GameStateMessage = {
		// Drop the ICN's clock stamps: the game page never reads them, and keeping them would
		// leave a dead game's moves stamped while a live game's aren't. Analysis keeps its own.
		moves: icnimport.movePacketsFromParsed(longformat.moves ?? []).map(({ token }) => ({ token })), // prettier-ignore
		gameConclusion: deadState.gameConclusion,
		finalized: true, // A dead game's result is locked in permanently.
	};

	return state;
}

export default { loadDeadGame };
