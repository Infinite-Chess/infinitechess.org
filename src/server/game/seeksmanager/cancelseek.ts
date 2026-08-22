// src/server/game/seeksmanager/cancelseek.ts

/**
 * Handles the `cancelseek` lobby action: an owner withdrawing their own open seek.
 *
 * The seek simply leaves `activeseeks.ts`. A seek deleted because its owner
 * dropped offline goes through `lobbymanager.ts`'s cushion instead.
 */

import type { SeekId } from '../../../shared/domain.js';
import type { CustomWebSocket } from '../../socket/socketTypes.js';

import activeseeks from './activeseeks.js';
import memberinfoutil from '../../utility/memberinfoutil.js';
import { logEventsAndPrint } from '../../middleware/logEvents.js';

/**
 * Cancels/deletes the specified seek.
 * @param ws - Their socket
 * @param messageContents - The incoming socket message that is the ID of the seek to be cancelled!
 */
function cancel(ws: CustomWebSocket, messageContents: SeekId): void {
	// Value should be the ID of the seek to cancel!
	const id = messageContents; // id of seek to delete

	const seekAndIndex = activeseeks.getByID(id); // { seek, index } | undefined
	// Already cancelled, they must have joined a game, OR CANCELLED on a different tab!
	if (!seekAndIndex) return;

	const { seek, index } = seekAndIndex;

	// Make sure they are the owner.
	if (!memberinfoutil.eq(ws.metadata.memberInfo, seek.owner)) {
		logEventsAndPrint(`Player tried to delete a seek that wasn't theirs!`, 'errLog');
	}

	activeseeks.deleteByIndex(seek, index);
}

// Exports ---------------------------------------------------------------------------------------

export default {
	cancel,
};
