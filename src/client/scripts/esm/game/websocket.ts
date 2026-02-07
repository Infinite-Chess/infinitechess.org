// src/client/scripts/esm/game/websocket.ts

/**
 * Barrel module that re-exports the public API of the websocket system.
 *
 * The websocket system is split into focused modules under `./websocket/`:
 * - `socketutil.ts`     - Shared types, constants, debug toggle, and custom events
 * - `socketsubs.ts`     - Subscription state management (add/delete/query)
 * - `socketmessages.ts` - Outgoing messages, echo tracking, and on-reply functions
 * - `socketrouter.ts`   - Incoming message routing (general/invites/game)
 * - `socketclose.ts`    - Close event handling and reconnection logic
 * - `socketman.ts`      - Socket lifecycle (open/close/establish/resub)
 */

// Import socketman to trigger its IIFE initialization (registers callbacks)

import socketman from './websocket/socketman.js';
import socketsubs from './websocket/socketsubs.js';
import socketmessages from './websocket/socketmessages.js';
import { toggleDebug } from './websocket/socketutil.js';

export type { WebsocketMessage, WebsocketMessageValue } from './websocket/socketutil.js';

/**
 * Unsubs from the provided subscription list,
 * informing the server we no longer want updates.
 * @param sub - The name of the sub to unsubscribe from
 */
function unsubFromSub(sub: 'invites' | 'game'): void {
	if (!socketsubs.areSubbedToSub(sub)) return; // Already unsubbed.
	socketsubs.deleteSub(sub);
	// Tell the server we no longer want updates.
	socketmessages.sendmessage('general', 'unsub', sub);
}

export default {
	toggleDebug,
	closeSocket: socketman.closeSocket,
	sendmessage: socketmessages.sendmessage,
	areSubbedToSub: socketsubs.areSubbedToSub,
	addSub: socketsubs.addSub,
	deleteSub: socketsubs.deleteSub,
	unsubFromSub,
	addTimerIDToCancelOnNewSocket: socketmessages.addTimerIDToCancelOnNewSocket,
};
