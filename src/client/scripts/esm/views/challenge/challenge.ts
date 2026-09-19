// src/client/scripts/esm/views/challenge/challenge.ts

/**
 * Entry point for the challenge page (/game/:id, before its game exists).
 *
 * Subscribes to the challenge and resubscribes after socket reconnections.
 */

import type { ClientboundChallengeMessage } from '../../../../../shared/transport/clientbound.js';

import socketsubs from '../../socket/socketsubs.js';
import socketsend from '../../socket/socketsend.js';
import challengecard from './challengecard.js';
import socketintents from '../../socket/socketintents.js';
import { SocketBus } from '../../socket/SocketBus.js';

import './challengepreview.js';

// Initial setup ---------------------------------------------------------------

subscribe();
SocketBus.addEventListener('reconnect', () => subscribe());

SocketBus.addEventListener('challenge', (e) => onChallengeMessage(e.detail));

/** Subscribes to this page's challenge. Unlike the lobby, never idle-unsubscribed: waiting is the page's whole job. */
function subscribe(): void {
	if (socketsubs.isSubbedTo('challenge')) return;
	socketsubs.addSub('challenge');
	void socketsend.send('challenge', 'subscribe', window.challengePageData.id);
}

/** Routes an incoming challenge-route message to the card. */
function onChallengeMessage(contents: ClientboundChallengeMessage): void {
	switch (contents.action) {
		case 'challengestate':
			challengecard.applyState(contents.value);
			// The challenge's state is now applied — release any intents held through the outage.
			socketintents.onRouteSynced('challenge');
			break;
		case 'ingame':
			challengecard.onInGame(contents.value);
			break;
		case 'outgame':
			challengecard.onOutGame();
			break;
		default:
			console.error("Unknown action received from server in 'challenge' route.", contents satisfies never); // prettier-ignore
	}
}
