
/**
 * This script handles invite cancelation.
 */

// Middleware imports
import { logEventsAndPrint } from '../../middleware/logEvents.js';

// Custom imports
import { isInviteOurs } from './inviteutility.js';
import socketUtility from '../../socket/socketUtility.js';

import { getInviteAndIndexByID, deleteInviteByIndex, IDLengthOfInvites } from './invitesmanager.js';
import { sendSocketMessage } from '../../socket/sendSocketMessage.js';

/** 
 * Type Definitions
 * @typedef {import('./inviteutility.js').Invite} Invite
 */

/** @typedef {import("../../socket/socketUtility.js").CustomWebSocket} CustomWebSocket */



/**
 * Cancels/deletes the specified invite.
 * @param {CustomWebSocket} ws - Their socket
 * @param {*} messageContents - The incoming socket message that SHOULD be the ID of the invite to be cancelled!
 * @param {number} replyto - The ID of the incoming socket message. This is used for the `replyto` property on our response.
 */
function cancelInvite(ws, messageContents, replyto) { // Value should be the ID of the invite to cancel!
	if (typeof messageContents !== 'string' || messageContents.length !== IDLengthOfInvites) return sendSocketMessage(ws, 'general', 'printerror', 'Body of socket message is invalid!', replyto);

	const id = messageContents; // id of invite to delete

	const inviteAndIndex = getInviteAndIndexByID(id); // { invite, index } | undefined
	if (!inviteAndIndex) return sendSocketMessage(ws, undefined, undefined, undefined, replyto); // Already cancelled, they must have joined a game, OR CANCELLED on a different tab!
    
	const { invite, index } = inviteAndIndex;

	// Make sure they are the owner.
	if (!isInviteOurs(ws, invite)) {
		console.error(`Player tried to delete an invite that wasn't theirs! Invite ID: ${id} Socket: ${socketUtility.stringifySocketMetadata(ws)}`);
		return sendSocketMessage(ws, "general", "printerror", "You are forbidden to delete this invite.", replyto);
	}

	deleteInviteByIndex(ws, invite, index, { replyto });
}


export {
	cancelInvite
};