// src/client/scripts/esm/views/index/index.ts

/**
 * Entry point for the index (home) page.
 *
 * Subscribes to lobby updates and resubscribes after socket reconnections.
 */

import type { ClientboundLobbyMessage } from '../../../../../shared/clientbound.js';

import lobby from './lobby.js';
import flashToast from '../../util/flashToast.js';
import socketintents from '../../socket/socketintents.js';
import { SocketBus } from '../../socket/SocketBus.js';

import './newPrompt.js';
import './gameSetupModal.js';

// Initial setup -----------------------------------------------------

// Show any toast queued before a redirect here (e.g. "Account activated!" after registering or "Your password was reset!").
flashToast.consume();

lobby.subscribe();
SocketBus.addEventListener('reconnect', () => lobby.subscribe());
SocketBus.addEventListener('closed', () => lobby.clearSeekList());

SocketBus.addEventListener('lobby', (e) => onLobbyMessage(e.detail));

function onLobbyMessage(contents: ClientboundLobbyMessage): void {
	switch (contents.action) {
		case 'lobbystate':
			lobby.handleLobbyState(contents.value);
			// The full lobby state is now applied — release any intents held through the outage.
			socketintents.onRouteSynced('lobby');
			break;
		case 'seekslist':
			lobby.onSeekListUpdate(contents.value);
			break;
		case 'viewercount':
			lobby.onViewerCountUpdate(contents.value);
			break;
		case 'ingame':
			void lobby.onInGame(contents.value);
			break;
		case 'outgame':
			lobby.onOutGame();
			break;
		default:
			console.error("Unknown action received from server in 'lobby' route.", contents satisfies never); // prettier-ignore
	}
}
