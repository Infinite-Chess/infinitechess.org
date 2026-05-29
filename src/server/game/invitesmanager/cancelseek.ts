// src/server/game/invitesmanager/cancelseek.ts

/**
 * This script handles invite cancelation.
 */

import type { CustomWebSocket } from '../../socket/socketUtility.js';

import * as z from 'zod';

import socketUtility from '../../socket/socketUtility.js';
import { memberInfoEq } from './inviteutility.js';
import { sendSocketMessage } from '../../socket/sendSocketMessage.js';
import { getInviteAndIndexByID, deleteInviteByIndex, IDLengthOfInvites } from './lobbymanager.js';

/** The zod schema for validating the contents of the cancelseek message. */
const cancelseekschem = z.string().length(IDLengthOfInvites);

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

	const inviteAndIndex = getInviteAndIndexByID(id); // { seek, index } | undefined
	// Already cancelled, they must have joined a game, OR CANCELLED on a different tab!
	// The client is expecting a response from us, even if empty, so it knows to unlock the create seek button again!
	if (!inviteAndIndex) return sendSocketMessage(ws, undefined, undefined, undefined);

	const { seek, index } = inviteAndIndex;

	// Make sure they are the owner.
	if (!memberInfoEq(ws.metadata.memberInfo, seek.owner)) {
		console.error(
			`Player tried to delete an invite that wasn't theirs! Invite ID: ${id} Socket: ${socketUtility.stringifySocketMetadata(ws)}`,
		);
		return sendSocketMessage(
			ws,
			'general',
			'printerror',
			'You are forbidden to delete this invite.',
		);
	}

	deleteInviteByIndex(seek, index);
}

export { cancelSeek, cancelseekschem };
