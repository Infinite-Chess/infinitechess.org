// src/client/scripts/esm/game/misc/onlinegame/deadgameloader.ts

/**
 * The dead/review load path: fetches a concluded game's {@link DeadGameState} over HTTP, parses its
 * ICN for the move list, normalizes it into the same `gamestate` shape the live path builds, and
 * hands it to the shared loader — no socket opened.
 */

import type { DeadGameState } from '../../../../../../shared/domain.js';
import type { LongFormatOut } from '../../../../../../shared/chess/logic/icn/icnconverter.js';
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
		// Parsed once here and handed on: it is also the start position of a custom game.
		const longformat = icnconverter.ShortToLong_Format(deadState.icn);
		const gameState = normalizeToGameState(deadState, longformat);
		onlinegame.loadGameFromState(gameState, true, longformat);
	} catch (e: unknown) {
		console.error('Failed to fetch/parse dead game state:', e);
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

/**
 * Normalizes a `DeadGameState` into the live `gamestate` shape the loader consumes.
 * @param longformat - The state's already-parsed {@link DeadGameState.icn}, holding its move list.
 */
function normalizeToGameState(
	deadState: DeadGameState,
	longformat: LongFormatOut,
): GameStateMessage {
	const state: GameStateMessage = {
		// The ICN's clock stamps ride along: they are the sole source of
		// the game's final clocks, which the loader derives from them.
		moves: icnimport.movePacketsFromParsed(longformat.moves ?? []),
		gameConclusion: deadState.gameConclusion,
		finalized: true, // A dead game's result is locked in permanently.
	};

	return state;
}

export default { loadDeadGame };
