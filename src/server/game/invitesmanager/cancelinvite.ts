
// src/server/game/invitesmanager/cancelinvite.ts

/**
 * This script handles invite cancelation.
 */

import * as z from 'zod';

import { memberInfoEq } from './inviteutility.js';
import socketUtility from '../../socket/socketUtility.js';
import { getInviteAndIndexByID, deleteInviteByIndex, IDLengthOfInvites } from './invitesmanager.js';
import { sendSocketMessage } from '../../socket/sendSocketMessage.js';


import type { CustomWebSocket } from '../../socket/socketUtility.js';

/** The zod schema for validating the contents of the cancelinvite message. */
const cancelinviteschem = z.string().length(IDLengthOfInvites);

/** This is also the id of the invite to delete */
type CancelInviteMessage = z.infer<typeof cancelinviteschem>


/**
 * Cancels/deletes the specified invite.
 * @param ws - Their socket
 * @param messageContents - The incoming socket message that is the ID of the invite to be cancelled!
 * @param replyto - The ID of the incoming socket message. This is used for the `replyto` property on our response.
 */
function cancelInvite(ws: CustomWebSocket, messageContents: CancelInviteMessage, replyto?: number): void { // Value should be the ID of the invite to cancel!
	const id = messageContents; // id of invite to delete

	const inviteAndIndex = getInviteAndIndexByID(id); // { invite, index } | undefined
	// Already cancelled, they must have joined a game, OR CANCELLED on a different tab!
	// The client is expecting a response from us, even if empty, so it knows to unlock the create invite button again!
	if (!inviteAndIndex) return sendSocketMessage(ws, undefined, undefined, undefined, replyto);
    
	const { invite, index } = inviteAndIndex;

	// Make sure they are the owner.
	if (!memberInfoEq(ws.metadata.memberInfo, invite.owner)) {
		console.error(`Player tried to delete an invite that wasn't theirs! Invite ID: ${id} Socket: ${socketUtility.stringifySocketMetadata(ws)}`);
		return sendSocketMessage(ws, "general", "printerror", "You are forbidden to delete this invite.", replyto);
	}

	deleteInviteByIndex(ws, invite, index, { replyto });
}

export {
	cancelInvite,

	cancelinviteschem
};