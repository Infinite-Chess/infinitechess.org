// src/server/game/seeksmanager/cancelseek.ts

/**
 * This script handles seek cancelation.
 */

import type { CustomWebSocket } from '../../socket/socketUtility.js';

import * as z from 'zod';

import { memberInfoEq } from './seekutility.js';
import { logEventsAndPrint } from '../../middleware/logEvents.js';
import { getSeekAndIndexByID, deleteSeekByIndex, IDLengthOfSeeks } from './lobbymanager.js';

/** The zod schema for validating the contents of the cancelseek message. */
const cancelseekschem = z.string().length(IDLengthOfSeeks);

/** This is also the id of the seek to delete */
type CancelSeekMessage = z.infer<typeof cancelseekschem>;

/**
 * Cancels/deletes the specified seek.
 * @param ws - Their socket
 * @param messageContents - The incoming socket message that is the ID of the seek to be cancelled!
 */
function cancelSeek(ws: CustomWebSocket, messageContents: CancelSeekMessage): void {
	// Value should be the ID of the seek to cancel!
	const id = messageContents; // id of seek to delete

	const seekAndIndex = getSeekAndIndexByID(id); // { seek, index } | undefined
	// Already cancelled, they must have joined a game, OR CANCELLED on a different tab!
	if (!seekAndIndex) return;

	const { seek, index } = seekAndIndex;

	// Make sure they are the owner.
	if (!memberInfoEq(ws.metadata.memberInfo, seek.owner)) {
		logEventsAndPrint(`Player tried to delete a seek that wasn't theirs!`, 'errLog');
	}

	deleteSeekByIndex(seek, index);
}

export { cancelSeek, cancelseekschem };
