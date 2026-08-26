// src/server/game/seeksmanager/cancelseek.ts

/**
 * Handles the `cancelseek` lobby action: an owner withdrawing their own open seek.
 *
 * The seek simply leaves `activeseeks.ts`. A seek deleted because its owner
 * dropped offline goes through `lobbymanager.ts`'s cushion instead.
 */

import type { SeekId } from '../../../shared/transport/domain.js';
import type { CustomWebSocket } from '../../socket/socketTypes.js';

import logEvents from '../../utility/logEvents.js';
import activeseeks from './activeseeks.js';
import memberinfoutil from '../../auth/memberinfoutil.js';

/**
 * Cancels/deletes the specified seek.
 * @param ws - Their socket
 * @param messageContents - The incoming socket message that is the ID of the seek to be cancelled!
 */
function cancel(ws: CustomWebSocket, messageContents: SeekId): void {
	// Value should be the ID of the seek to cancel!
	const id = messageContents; // id of seek to delete

	const seek = activeseeks.getByID(id);
	// Already cancelled, they must have joined a game, OR CANCELLED on a different tab!
	if (!seek) return;

	// Make sure they are the owner.
	if (!memberinfoutil.eq(ws.metadata.memberInfo, seek.owner)) {
		logEvents.addAndPrint(`Player tried to delete a seek that wasn't theirs!`, 'errLog');
		return;
	}

	activeseeks.deleteByID(id);
}

// Exports ---------------------------------------------------------------------

export default {
	cancel,
};
