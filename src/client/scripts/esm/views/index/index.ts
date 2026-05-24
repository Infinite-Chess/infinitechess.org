// src/client/scripts/esm/views/index/index.ts

/**
 * Entry point for the index (home) page.
 * Wires socket routing to the lobby and subscribes to the invites list.
 */

import type { InvitesMessage } from '../../game/websocket/socketschemas.js';

import lobby from './lobby.js';
import socketman from '../../game/websocket/socketman.js';
import socketrouter from '../../game/websocket/socketrouter.js';

import './gameSetupModal.js';

// Wire the invites message handler and resub callback before subscribing.
socketrouter.setInvitesHandler(onInvitesMessage);
socketman.setInvitesResubHandler(() => lobby.subscribeToInvites(true));

lobby.subscribeToInvites();

function onInvitesMessage(contents: InvitesMessage): void {
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
