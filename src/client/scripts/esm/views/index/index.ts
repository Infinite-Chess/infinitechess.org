// src/client/scripts/esm/views/index/index.ts

/**
 * Entry point for the index (home) page.
 *
 * Subscribes to lobby updates and resubscribes after socket reconnections.
 */

import type { LobbyMessage } from '../../game/websocket/socketschemas.js';

import lobby from './lobby.js';
import { SocketBus } from '../../game/websocket/SocketBus.js';

import './gameSetupModal.js';

// Initial setup -----------------------------------------------------

lobby.subscribe();
SocketBus.addEventListener('reconnected', () => lobby.subscribe(true));

SocketBus.addEventListener('lobby', (e) => onLobbyMessage(e.detail));

function onLobbyMessage(contents: LobbyMessage): void {
	switch (contents.action) {
		case 'inviteslist':
			lobby.onSeekListUpdate(contents.value.invitesList);
			break;
		case 'gamecount':
			// Active game count not displayed in the new lobby.
			break;
		default:
			// @ts-ignore
			console.error(`Unknown invites action: ${contents.action}`);
	}
}
