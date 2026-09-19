// src/server/game/seeksmanager/challengeRouter.ts

/**
 * Routes every incoming websocket message on the "challenge" route to its handler.
 *
 * See docs/systems/WEBSOCKETS.md.
 */

import type { CustomWebSocket } from '../../socket/socketTypes.js';
import type { ServerboundChallengeMessage } from '../../../shared/transport/serverbound.js';

import cancelSeek from './cancelSeek.js';
import acceptSeek from './acceptSeek.js';
import challengeManager from './challengeManager.js';

/**
 * Routes all incoming websocket messages related to a challenge page. Every action
 * but `subscribe` acts on the challenge this socket itself subscribed to.
 */
function route(ws: CustomWebSocket, contents: ServerboundChallengeMessage): void {
	// The action that needs no challenge
	switch (contents.action) {
		case 'subscribe':
			challengeManager.subscribe(ws, contents.value);
			return;
	}

	// Expected, rare: the challenge died (its sockets detached) while this action was in flight.
	const subscription = ws.metadata.subscriptions.challenge;
	if (subscription === undefined) return;

	switch (contents.action) {
		case 'accept':
			acceptSeek.accept(ws, subscription.id);
			break;
		case 'cancel':
			cancelSeek.cancel(ws, subscription.id);
			break;
		default:
			console.error('UNKNOWN web socket action received in challenge route!', contents satisfies never); // prettier-ignore
	}
}

// Exports ---------------------------------------------------------------------

export default { route };
