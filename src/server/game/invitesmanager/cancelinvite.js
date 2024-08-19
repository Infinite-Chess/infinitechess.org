
/**
 * This script handles invite cancelation.
 */

// Middleware imports
const { logEvents } = require('../../middleware/logEvents.js');

// Custom imports
// eslint-disable-next-line no-unused-vars
const { Socket } = require('../TypeDefinitions.js');
// eslint-disable-next-line no-unused-vars
const { Invite, isInviteOurs } = require('./inviteutility.js');
const wsutility = require('../wsutility.js');
const sendNotify = wsutility.sendNotify;
const sendNotifyError = wsutility.sendNotifyError;

const { getInviteAndIndexByID, deleteInviteByIndex, IDLengthOfInvites } = require('./invitesmanager.js');



/**
 * Cancels/deletes the specified invite.
 * @param {Socket} ws - Their socket
 * @param {*} messageContents - The incoming socket message that SHOULD be the ID of the invite to be cancelled!
 * @param {number} replyto - The ID of the incoming socket message. This is used for the `replyto` property on our response.
 */
function cancelInvite(ws, messageContents, replyto) { // Value should be the ID of the invite to cancel!
    if (typeof messageContents !== 'string' || messageContents.length !== IDLengthOfInvites) return ws.metadata.sendmessage(ws, 'general', 'printerror', 'Body of socket message is invalid!', replyto);

    const id = messageContents; // id of invite to delete

    const inviteAndIndex = getInviteAndIndexByID(id); // { invite, index } | undefined
    if (!inviteAndIndex) return ws.metadata.sendmessage(ws, undefined, undefined, undefined, replyto); // Already cancelled, they must have joined a game, OR CANCELLED on a different tab!
    
    const { invite, index } = inviteAndIndex;

    // Make sure they are the owner.
    if (!isInviteOurs(ws, invite)) {
        const errText = `Player tried to delete an invite that wasn't theirs! Invite ID: ${id} Socket: ${wsutility.stringifySocketMetadata(ws)}`;
        logEvents(errText, 'hackLog.txt', { print: true });
        return ws.metadata.sendmessage(ws, "general", "printerror", "You are forbidden to delete this invite.", replyto);
    }

    deleteInviteByIndex(ws, invite, index, { replyto });
}


module.exports = {
    cancelInvite
};