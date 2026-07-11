// src/client/scripts/esm/game/misc/onlinegame/deadgameloader.ts

/**
 * The dead/review load path: fetches a concluded game's {@link DeadGameState} over HTTP, parses its
 * ICN for the move list (and clock stamps), normalizes it into the same `gamestate` shape the live
 * path builds, and hands it to the shared loader — no socket opened.
 */

import type { DeadGameState, GameStateMessage } from '../../../../../../shared/types.js';

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
		onlinegame.loadGameFromState(gameState, true, window.gamePageData.role);
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
	// Parse the ICN for the move list and clock stamps.
	const longformat = icnconverter.ShortToLong_Format(deadState.icn);

	const state: GameStateMessage = {
		moves: icnimport.movePacketsFromParsed(longformat.moves ?? []),
		gameConclusion: deadState.gameConclusion,
		finalized: true, // A dead game's result is locked in permanently.
	};

	return state;
}

export default { loadDeadGame };
