// src/client/scripts/esm/views/index/LobbyBus.ts

/**
 * Typed event bus for lobby-page facts. The lobby dispatches; page widgets
 * (e.g. the game-setup modal) subscribe and react.
 */

import { EventBus } from '../../../../../shared/util/EventBus.js';

interface LobbyBusEvents {
	/** Seek creation is off the table for now — a game was entered, or the lobby idled out. */
	'seek-creation-closed': void;
}

export const LobbyBus: EventBus<LobbyBusEvents> = new EventBus<LobbyBusEvents>();
