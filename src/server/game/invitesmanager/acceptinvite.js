
/**
 * This script handles invite acceptance,
 * creating a new game if successful.
 */

// Middleware imports
const { logEvents } = require('../../middleware/logEvents.js');

// Custom imports
// eslint-disable-next-line no-unused-vars
const { Socket } = require('../TypeDefinitions.js')
// eslint-disable-next-line no-unused-vars
const { Invite, isInviteOurs } = require('./inviteutility.js')
const wsutility = require('../wsutility.js');
const sendNotify = wsutility.sendNotify;
const { createGame } = require('../gamemanager/gamemanager.js');
const { removeSocketFromInvitesSubs } = require('./invitessubscribers.js');
const { broadcastGameCountToInviteSubs } = require('../gamemanager/gamecount')
const { getInviteAndIndexByID, deleteInviteByIndex, deleteUsersExistingInvite, findSocketFromOwner, onPublicInvitesChange, IDLengthOfInvites } = require('./invitesmanager.js');
const { isSocketInAnActiveGame } = require('../gamemanager/activeplayers.js');


/**
 * Attempts to accept an invite of given id.
 * @param {Socket} ws - The socket performing this action
 * @param {*} messageContents - The incoming socket message that SHOULD look like: `{ id, isPrivate }`
 */
function acceptInvite(ws, messageContents) { // { id, isPrivate }

    if (isSocketInAnActiveGame(ws)) return sendNotify(ws, "server.javascript.ws-already_in_game");

    if (!verifyMessageContents(messageContents)) return ws.metadata.sendmessage(ws, "general", "printerror", "Cannot cancel invite when incoming socket message body is in an invalid format!");
    const { id, isPrivate } = messageContents;


    // Does the invite still exist?
    const inviteAndIndex = getInviteAndIndexByID(id) // { invite, index }
    if (!inviteAndIndex) return informThemGameAborted(ws, isPrivate, id);

    const { invite, index } = inviteAndIndex;

    // Make sure they are not accepting their own.
    if (isInviteOurs(ws, invite)) {
        const errString = `Player tried to accept their own invite! Socket: ${wsutility.stringifySocketMetadata(ws)}`
        logEvents(errString, 'hackLog.txt', { print: true }) // Log the exploit to the hackLog!
        return sendNotify(ws, "server.javascript.ws-accept_own_invite");
    }

    // Make sure it's legal for them to accept. (Not legal if they are a guest and the invite is RATED)
    // ...

    // Accept the invite!

    let hadPublicInvite = false;
    // Delete the invite accepted.
    if (deleteInviteByIndex(ws, invite, index, { dontBroadcast: true })) hadPublicInvite = true;
    // Delete their existing invites
    if (deleteUsersExistingInvite(ws)) hadPublicInvite = true;

    // Start the game! Notify both players and tell them they've been subscribed to a game!

    const player1Socket = findSocketFromOwner(invite.owner); // Could be undefined occasionally
    const player2Socket = ws;
    createGame(invite, player1Socket, player2Socket)

    // Unsubscribe them both from the invites subscription list.
    if (player1Socket) removeSocketFromInvitesSubs(player1Socket); // Could be undefined occasionally
    removeSocketFromInvitesSubs(player2Socket);

    // Broadcast the invites list change after creating the game,
    // because the new game ups the game count.
    if (hadPublicInvite) onPublicInvitesChange(); // Broadcast to all invites list subscribers!
    else broadcastGameCountToInviteSubs();
}

/**
 * Tests if the provided message contents/body is valid for canceling an invite.
 * @param {*} messageContents - The body of the incoming websocket message. It should look like: `{ id, isPrivate }`
 * @returns {boolean} true if the message contents is valid for the cancellation of an invite
 */
function verifyMessageContents(messageContents) {
    // Is it an object? (This may pass if it is an array, but arrays won't crash when accessing property names, so it doesn't matter. It will be rejected because it doesn't have the required properties.)
    // We have to separately check for null because JAVASCRIPT has a bug where  typeof null => 'object'
    if (typeof messageContents !== 'object' || messageContents === null) return false;

    /**
     * These are the properties it must contain:
     * id
     * isPrivate
     */

    if (typeof messageContents.id !== 'string' || messageContents.id.length !== IDLengthOfInvites) return false;
    if (typeof messageContents.isPrivate !== 'boolean') return false;

    return true;
}

/**
 * Called when a player clicks to accept an invite that gets deleted right before.
 * This tells them the game was aborted, or that the code
 * was invalid, if they entered a private invite code.
 * @param {Socket} ws 
 * @param {boolean} isPrivate 
 * @param {*} inviteID 
 * @returns 
 */
function informThemGameAborted(ws, isPrivate, inviteID) {
    const errString = isPrivate ? "server.javascript.ws-invalid_code" : "server.javascript.ws-game_aborted";
    if (isPrivate) console.log(`User entered incorrect invite code! Code: ${inviteID}   Socket: ${wsutility.stringifySocketMetadata(ws)}`)
    return sendNotify(ws, errString);
}


module.exports = {
    acceptInvite
}