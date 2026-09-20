// src/server/game/seeksmanager/cancelSeek.ts

/**
 * Handles the `cancelseek` lobby action and the challenge page's `cancel`: an owner
 * withdrawing their own open seek.
 *
 * The seek simply leaves `activeSeeks.ts`. A seek deleted because its owner
 * dropped offline goes through `lobbyManager.ts`'s cushion instead.
 */

import type { CustomWebSocket } from '../../socket/socketTypes.js';

import logEvents from '../../utility/logEvents.js';
import activeSeeks from './activeSeeks.js';
import memberInfoUtil from '../../auth/memberInfoUtil.js';

/**
 * Cancels/deletes the specified seek.
 * @param ws - Their socket
 * @param id - The id of the seek to cancel.
 */
function cancel(ws: CustomWebSocket, id: number): void {
	const seek = activeSeeks.getByID(id);
	// Already cancelled, they must have joined a game, OR CANCELLED on a different tab!
	if (!seek) return;

	// Make sure they are the owner.
	if (!memberInfoUtil.eq(ws.metadata.memberInfo, seek.owner)) {
		logEvents.addAndPrint(`Player tried to delete a seek that wasn't theirs!`, 'errLog');
		return;
	}

	activeSeeks.deleteByID(id);
}

// Exports ---------------------------------------------------------------------

export default {
	cancel,
};
