
/**
 * This script handles invite cancelation.
 */

// System imports
const fs = require('fs')
const path = require('path');

// Middleware imports
const { logEvents } = require('../../middleware/logEvents.js');
const { readFile, writeFile } = require('../../utility/lockFile.js');
const { getUsernameCaseSensitive } = require('../../controllers/members.js')

// Custom imports
const { Socket } = require('../TypeDefinitions.js')
const { Invite, isInviteOurs } = require('./inviteutility.js')
const wsutility = require('../wsutility.js');
const sendNotify = wsutility.sendNotify;
const sendNotifyError = wsutility.sendNotifyError;
const math1 = require('../math1.js')
const variant1 = require('../variant1.js')
const clockweb = require('../clockweb.js');
const { writeFile_ensureDirectory } = require('../../utility/fileUtils');
const { setTimeServerRestarting, cancelServerRestart, getTimeServerRestarting } = require('../serverrestart.js');
const { createGame, isSocketInAnActiveGame } = require('../gamemanager/gamemanager.js');
const { getDisplayNameOfPlayer } = require('../gamemanager/gameutility.js');
const { getInviteSubscribers, addSocketToInvitesSubs, removeSocketFromInvitesSubs } = require('./invitessubscribers.js');

const { getActiveGameCount } = require('../gamemanager/gamecount');
const { getInviteAndIndexByID, deleteInviteByIndex, IDLengthOfInvites } = require('./invitesmanager.js');



/**
 * Cancels/deletes the specified invite.
 * @param {Socket} ws - Their socket
 * @param {*} messageContents - The incoming socket message that SHOULD be the ID of the invite to be cancelled!
 * @param {number} replyto - The ID of the incoming socket message. This is used for the `replyto` property on our response.
 */
function cancelInvite (ws, messageContents, replyto) { // Value should be the ID of the invite to cancel!
    if (typeof messageContents !== 'string' || messageContents.length !== IDLengthOfInvites) return ws.metadata.sendmessage(ws, 'general', 'printerror', 'Body of socket message is invalid!', replyto)

    const id = messageContents; // id of invite to delete

    const inviteAndIndex = getInviteAndIndexByID(id) // { invite, index } | undefined
    if (!inviteAndIndex) return sendNotify(ws, "server.javascript.ws-invite_cancelled"); // Already cancelled
    // This allows them to spam the button without receiving errors.
    //if (!inviteAndIndex) return;
    
    const { invite, index } = inviteAndIndex;

    // Make sure they are the owner.
    if (!isInviteOurs(ws, invite)) {
        const errText = `Player tried to delete an invite that wasn't theirs! Invite ID: ${id} Socket: ${wsutility.stringifySocketMetadata(ws)}`
        logEvents(errText, 'hackLog.txt', { print: true })
        return ws.metadata.sendmessage(ws, "general", "printerror", "You are forbidden to delete this invite.", replyto)
    }

    deleteInviteByIndex(ws, invite, index, replyto);
}


module.exports = {
    cancelInvite
}