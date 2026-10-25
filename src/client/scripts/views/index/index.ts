// src/client/scripts/views/index/index.ts

/**
 * Entry point for the index (home) page.
 *
 * Subscribes to the lobby, resubscribing after reconnects, and routes its messages to
 * the seek list and featured games, clearing them once the connection is truly lost.
 */

import type { ClientboundLobbyMessage } from '../../../../shared/transport/clientbound.js';

import lobby from './lobby.js';
import flashtoast from '../../components/flashtoast.js';
import featuredgames from './featured/featuredgames.js';
import socketintents from '../../socket/socketintents.js';
import { SocketBus } from '../../socket/SocketBus.js';
import socketconnection from '../../socket/socketconnection.js';

import './newprompt.js';
import './gamesetup/gamesetupmodal.js';

// State -----------------------------------------------------------------------

/** Clears the lobby once we've been desynced for a given time. */
let clearTimer: number | undefined;

// Initial setup ---------------------------------------------------------------

// Show any toast queued before a redirect here
// (e.g. "Account activated!" after registering or "Your password was reset!").
flashtoast.consume();

lobby.subscribe();
SocketBus.addEventListener('reconnect', () => lobby.subscribe());
SocketBus.addEventListener('closed', () => armClearTimer());

SocketBus.addEventListener('lobby', (e) => onLobbyMessage(e.detail));

/** Counts down to clearing the lobby from the first close: every failed reconnect closes again. */
function armClearTimer(): void {
	clearTimer ??= window.setTimeout(() => {
		clearTimer = undefined;
		lobby.clearSeekList();
	}, socketconnection.TIME_TO_WAIT_FOR_HTTP_MS);
}

/** Routes incoming lobby messages to the lobby controls. */
function onLobbyMessage(contents: ClientboundLobbyMessage): void {
	switch (contents.action) {
		case 'lobbystate':
			clearTimeout(clearTimer);
			clearTimer = undefined;
			lobby.handleLobbyState(contents.value);
			featuredgames.onGameCount(contents.value.gamecount);
			featuredgames.onSubscribed(contents.value.featured);
			// The full lobby state is now applied — release any intents held through the outage.
			socketintents.onRouteSynced('lobby');
			break;
		// Seeks and viewers
		case 'seekslist':
			lobby.onSeekListUpdate(contents.value);
			break;
		case 'viewercount':
			lobby.onViewerCountUpdate(contents.value);
			break;
		case 'challengecreated':
			lobby.onChallengeCreated(contents.value);
			break;
		// In-game status
		case 'ingame':
			void lobby.onInGame(contents.value);
			break;
		case 'outgame':
			lobby.onOutGame();
			break;
		// Games in play
		case 'gamecount':
			featuredgames.onGameCount(contents.value);
			break;
		case 'featured':
			featuredgames.onSnapshot(contents.value);
			break;
		case 'featuredmove':
		case 'featuredclock':
		case 'featuredconclusion':
			featuredgames.onUpdate(contents);
			break;
		default:
			console.error("Unknown action received from server in 'lobby' route.", contents satisfies never); // prettier-ignore
	}
}
