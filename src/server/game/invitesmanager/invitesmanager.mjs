
/**
 * This script manages our list of all active invites,
 * subscribes and unsubs sockets to and from the invites
 * subscription list,
 * and broadcasts changes out to the clients.
 */

// eslint-disable-next-line no-unused-vars
import { Socket } from '../TypeDefinitions.mjs';
// eslint-disable-next-line no-unused-vars
import { Invite, isInvitePrivate, makeInviteSafe, safelyCopyInvite, isInviteOurs, isInvitePublic } from './inviteutility.mjs';
import { wsutility } from '../wsutility.mjs'
import { math1 } from '../math1.mjs/index.js'
import { getInviteSubscribers, addSocketToInvitesSubs, removeSocketFromInvitesSubs } from './invitessubscribers.mjs';

import { getActiveGameCount } from '../gamemanager/gamecount.mjs';

//-------------------------------------------------------------------------------------------

/** Whether to log new invite creations/deletions to the console */
const printNewInviteCreationsAndDeletions = true;

/** The number of digits generated invite IDs are. */
const IDLengthOfInvites = 5;

/** The list of all active invites, including private ones. @type {Invite[]} */
let invites = [];

/**
 * Time to allow the client to reconnect after an UNEXPECTED (not purposeful)
 * socket closure before any invite of theirs is deleted!
 */
const cushionToDisconnectMillis = 5000; // 5 seconds

/**
 * An object containing usernames for the keys, and setTimeout timer ID's for the values,
 * that represent the timers that are currently active to delete all a player's invites
 * since they've disconnected.
 */
const timersMember = {};
/**
 * An object containing browser-ids for the keys, and setTimeout timer ID's for the values,
 * that represent the timers that are currently active to delete all a browser's invites
 * since they've disconnected.
 */
const timersBrowser = {};

//-------------------------------------------------------------------------------------------

/**
 * Gets the list of public invites with sensitive information REMOVED (such as browser-ids)
 * DOES NOT include private invites, not even your own, ADD THOSE SEPARATELY.
 * @returns {Invite[]}
 */
function getPublicInvitesListSafe() {
    /** @type {Invite[]} */
    const deepCopiedInvites = math1.deepCopyObject(invites);
    // Remove private invites
    for (let i = deepCopiedInvites.length - 1; i >= 0; i--) { // Iterate backwards because we are destructive
        const thisInvite = deepCopiedInvites[i];
        if (isInvitePrivate(thisInvite)) deepCopiedInvites.splice(i, 1); // Delete
    }
    // Remove sensitive information
    return removeSensitiveInfoFromInvitesList(deepCopiedInvites);
}

/**
 * Removes browser-id's from the invites list, and makes members' usernames case-sensitive.
 * @param {Invite[]} copyOfInvitesList
 * @returns {Invite[]} The invites list with sensitive info removed.
 */
function removeSensitiveInfoFromInvitesList(copyOfInvitesList) {
    return copyOfInvitesList.map(function(thisInvite, index, copyOfInvitesList) {
        return makeInviteSafe(thisInvite);
    });
}

/**
 * Adds any private invite that belongs to the socket to the provided invites list.
 * @param {Socket} ws 
 * @param {Invites[]} copyOfInvitesList - A copy of the invites list, so we don't modify the original
 * @returns {Invite[]}
 */
function addMyPrivateInviteToList(ws, copyOfInvitesList) {
    for (const invite of invites) {
        if (isInvitePublic(invite)) continue; // Next invite, this one isn't private
        if (!isInviteOurs(ws, invite)) continue; // Doesn't belong to us
        const inviteSafeCopy = safelyCopyInvite(invite); // Makes a deep copy and removes sensitive information
        copyOfInvitesList.push(inviteSafeCopy);
    }
    return copyOfInvitesList;
}

// When a PUBLIC invite is added or removed..

/** 
 * Call when a public invite is added or deleted. 
 * @param {Socket} ws - The websocket that trigerred this public invites change.
 * @param {number} [replyto] - The ID of the incoming websocket message that triggered this method
 */
function onPublicInvitesChange(ws, replyto) { // The message that this broadcast is the reply to
    broadcastInvites(ws, replyto);
}

/**
 * Broadcasts the invites list out to all subbed clients.
 * @param {Socket} ws - The websocket that trigerred this broadcast. Used to include the replyto id for ONLY THEIR message.
 * @param {number} [replyto] - The ID of the incoming websocket message that triggered this broadcast
 */
function broadcastInvites(ws, replyto) {
    const newInvitesList = getPublicInvitesListSafe();
    const currentGameCount = getActiveGameCount();

    const subscribedClients = getInviteSubscribers();
    for (const subbedSocket of Object.values(subscribedClients)) {
        const newInvitesListCopy = math1.deepCopyObject(newInvitesList);
        // Only include the replyto code with the invite list if this socket is
        // THE SAME SOCKET as the one that triggered this broadcast.
        const includedReplyTo = ws === subbedSocket ? replyto : undefined;
        sendClientInvitesList(subbedSocket, { invitesList: newInvitesListCopy, currentGameCount, replyto: includedReplyTo });
    }
}

/**
 * Sends the invites list to a specified socket, including any private invites the player owns,
 * and also sends the current active game count.
 * @param {Socket} ws - The socket of the player to send the invites list to.
 * @param {Object} [options] - Optional parameters.
 * @param {Invite[]} [options.invitesList=getPublicInvitesListSafe()] - The list of invites to send. Defaults to the public invites list if not provided.
 * @param {number} [options.currentGameCount=getActiveGameCount()] - The current active game count. Defaults to the current game count if not provided.
 * @param {number} [options.replyto] - The incoming websocket message ID, to include in the reply, if applicable.
 */
function sendClientInvitesList(ws, { invitesList = getPublicInvitesListSafe(), currentGameCount = getActiveGameCount(), replyto } = {}) {
    invitesList = addMyPrivateInviteToList(ws, invitesList);
    const message = { invitesList, currentGameCount };
    ws.metadata.sendmessage(ws, "invites", "inviteslist", message, replyto); // In order: socket, sub, action, value
}

/**
 * Adds a new invite to the list of active invites.
 * Typically called when an invite is created. Sends the new invites list to the socket.
 * @param {Socket} ws - The socket of the player that created this invite. Used to send them the new invites list with their invite.
 * @param {Invite} invite - The invite to sdd
 * @param {number} [replyto] - The incoming websocket message ID, to include in the reply, if applicable
 */
function addInvite(ws, invite, replyto) {
    invites.push(invite);

    if (isInvitePublic(invite)) onPublicInvitesChange(ws, replyto);
    else sendClientInvitesList(ws, { replyto }); // Send them the new list after their invite creation!

    if (printNewInviteCreationsAndDeletions) {
        if (isInvitePrivate(invite)) console.log(`Created PRIVATE invite for user ${JSON.stringify(invite.owner)}`);
        else                         console.log(`Created invite for user ${JSON.stringify(invite.owner)}`);
    }
}

/**
 * Deletes an invite from the list of active invites.
 * Typically called when an invite is canceled. Sends the updated invites list to the socket.
 * @param {Socket} ws - The socket of the player that canceled this invite. Used to send them the updated invites list.
 * @param {Invite} invite - The invite object to cancel. Contains details about the invite and its owner.
 * @param {number} index - The index of the invite in the invites array. This is found using {@link getInviteAndIndexByID}.
 * @param {Object} [options] - Optional parameters.
 * @param {boolean} [options.dontBroadcast=false] - If true, prevents broadcasting the changes to all clients.
 * @param {number} [options.replyto] - The incoming websocket message ID, to include in the reply, if applicable.
 * @returns {boolean} true if there was a public invite change
 */
function deleteInviteByIndex(ws, invite, index, { dontBroadcast, replyto } = {}) {
    if (index > invites.length - 1) return console.error(`Cannot delete invite of index ${index} when the length of our invites list is ${invites.length}!`);
    invites.splice(index, 1); // Delete the invite

    if (!dontBroadcast) {
        if (isInvitePublic(invite)) onPublicInvitesChange(ws, replyto);
        else sendClientInvitesList(ws, { replyto }); // Send them the new list after their invite cancellation!
    }

    if (printNewInviteCreationsAndDeletions) console.log(`Deleted invite for user ${JSON.stringify(invite.owner)}`);

    return isInvitePublic(invite); // true if a public invite changed
}

/**
 * Returns true if the provided socket is the owner of any active invites.
 * If so, they aren't allowed to create more.
 * @param {Socket} ws 
 * @returns {boolean}
 */
function userHasInvite(ws) {
    for (const invite of invites) if (isInviteOurs(ws, invite)) return true;
    return false; // Player doesn't have an existing invite
}

/**
 * Tests if any active invite already has the ID provided.
 * This is used during generation of a unique invite id.
 * @param {string} id 
 * @returns {boolean} true if the ID is already in use, false if it's available
 */
function existingInviteHasID(id) {
    for (const invite of invites) if (invite.id === id) return true;
    return false;
}

/**
 * Finds an index by ID, and returns an object: `{ invite, index }`, otherwise undefined.
 * @param {number} id - The invite ID
 * @returns {Object | undefined} An object: `{ invite, index }`, or undefined if the invite wasn't found.
 */
function getInviteAndIndexByID(id) {
    for (let i = 0; i < invites.length; i++) {
        if (id === invites[i].id) return { invite: invites[i], index: i };
    }
}

//-------------------------------------------------------------------------------------------

/**
 * Returns the first socket subscribed to the invites list that matches the member/browser property.
 * Typically called when you need to inform a player their invite was accepted.
 * @returns {Socket | undefined} - The websocket, if found, otherwise undefined.
 */
function findSocketFromOwner(owner) { // { member/browser }
    // Iterate through all sockets, until you find one that matches the authentication of our invite owner
    const subscribedClients = getInviteSubscribers(); // { id: ws }
    if (owner.member) {
        for (const ws of Object.values(subscribedClients)) {
            if (ws.metadata.user === owner.member) return ws;
        }
    } else if (owner.browser) {
        for (const ws of Object.values(subscribedClients)) {
            if (ws.metadata['browser-id'] === owner.browser) return ws;
        }
    } else return console.error(`Cannot find socket from owner of invite when owner does not have a member nor browser property! Owner: ${JSON.stringify(owner)}`);

    console.log(`Unable to find a socket subbed to the invites list that belongs to ${JSON.stringify(owner)}!`);
}

/**
 * Subscribes a socket to the invites subscription list,
 * sends them the list of active invites,
 * and cancels any active timers to delete their invites if
 * their socket was previously closed by a network interruption.
 * @param {Socket} ws 
 */
function subToInvitesList(ws) { // data: { route, action, value, id }
    if (ws.metadata.subscriptions.invites) return console.log(`CANNOT double-subscribe this socket to the invites list!! They should not have requested this! Metadata: ${wsutility.stringifySocketMetadata(ws)}`);
    // if (ws.metadata.subscriptions.invites) return; // Already subscribed

    addSocketToInvitesSubs(ws);
    sendClientInvitesList(ws);
    cancelTimerToDeleteUsersInvitesFromNetworkInterruption(ws);
}

// Set closureNotByChoice to true if you don't immediately want to delete their invite, but say after 5 seconds.
function unsubFromInvitesList(ws, closureNotByChoice) { // data: { route, action, value, id }
    removeSocketFromInvitesSubs(ws);

    // One day this could be modified to not delete their existing invite
    // IF THEY have another socket connected!
    if (!closureNotByChoice) {
        // Delete their existing invites
        if (deleteUsersExistingInvite(ws)) onPublicInvitesChange();
        return;
    }

    // The closure WASN'T by choice! Set a 5s timer to give them time to reconnect before deleting their invite!
    // console.log("Setting a 5-second timer to delete a user's invites!")

    if (ws.metadata.user) timersMember[ws.metadata.user] = setTimeout(deleteMembersExistingInvite, cushionToDisconnectMillis, ws);
    if (ws.metadata['browser-id']) timersBrowser[ws.metadata['browser-id']] = setTimeout(deleteBrowsersExistingInvite, cushionToDisconnectMillis, ws);
}

/**
 * Cancels any running timers to delete a users invites from a network interruption.
 * @param {Socket} ws - The socket of the new invite subscriber
 */
function cancelTimerToDeleteUsersInvitesFromNetworkInterruption(ws) {
    if (ws.metadata.user) {
        clearTimeout(timersMember[ws.metadata.user]);
        delete timersMember[ws.metadata.user];
    } if (ws.metadata['browser-id']) {
        clearTimeout(timersBrowser[ws.metadata['browser-id']]);
        delete timersBrowser[ws.metadata['browser-id']];
    }
}

//-------------------------------------------------------------------------------------------

/**
 * Deletes all active invites from a specific user. They should only ever have one.
 * If a single public invite is deleted, this returns true.
 * @param {Socket} ws - The socket that belongs to the user we want to delete the invites of
 * @returns {boolean} Whether atleast 1 public invite was deleted
 */
function deleteUsersExistingInvite(ws) { // Set dontBroadcastChange to true if you broadcast the change outside of this.
    let deleted1PublicInvite = false;
    for (let i = invites.length - 1; i >= 0; i--) {
        const invite = invites[i];
        if (!isInviteOurs(ws, invite)) continue;
        if (isInvitePublic(invite)) deleted1PublicInvite = true;
        invites.splice(i, 1); // Delete the invite.
        console.log(`Deleted users invite: ${JSON.stringify(invite.owner)}`);
    }
    return deleted1PublicInvite;
}

/**
 * Deletes all active invites from a specific member. They should only ever have one.
 * If any public invite is deleted, it broadcasts the new invites list to all subs.
 * @param {Socket} ws - The socket of the member
 */
function deleteMembersExistingInvite(ws) {
    const member = ws.metadata.user;
    if (!member) return; // No username (guest), no invite!
    let deleted1PublicInvite = false;
    for (let i = invites.length - 1; i >= 0; i--) {
        const invite = invites[i];
        if (member !== invite.owner.member) continue;
        if (isInvitePublic(invite)) deleted1PublicInvite = true;
        invites.splice(i, 1); // Delete the invite.
        console.log(`Deleted members invite from disconnection. Metadata: ${wsutility.stringifySocketMetadata(ws)}`);
    }
    if (deleted1PublicInvite) onPublicInvitesChange();
}

/**
 * Deletes all active invites from a specific browser. They should only ever have one.
 * If any public invite is deleted, it broadcasts the new invites list to all subs.
 * @param {Socket} ws - The socket of the browser
 */
function deleteBrowsersExistingInvite(ws) {
    const browser = ws.metadata['browser-id'];
    if (!browser) return; // No browser-id (logged in), no invite!
    let deleted1PublicInvite = false;
    for (let i = invites.length - 1; i >= 0; i--) {
        const invite = invites[i];
        if (browser !== invite.owner.browser) continue;
        if (isInvitePublic(invite)) deleted1PublicInvite = true;
        invites.splice(i, 1); // Delete the invite.
        console.log(`Deleted browsers invite from disconnection. Metadata: ${wsutility.stringifySocketMetadata(ws)}`);
    }
    if (deleted1PublicInvite) onPublicInvitesChange();
}

/**
 * Deletes all invites the belong to the member.
 * This is called after a member logs out.
 * @param {string} usernameLowercase 
 */
function deleteAllInvitesOfMember(usernameLowercase) {
    if (usernameLowercase == null) return console.error("Cannot delete all invites of member without their username.");

    let publicInviteDeleted = false;
    invites = invites.filter((invite) => { // { id, owner, variant, clock, color, rated, publicity }
        const inviteMatches = invite.owner.member === usernameLowercase;
        if (inviteMatches && isInvitePublic(invite)) publicInviteDeleted = true;
        return !inviteMatches;
    });
    if (publicInviteDeleted) onPublicInvitesChange();
}

//-------------------------------------------------------------------------------------------

export {
    subToInvitesList,
    unsubFromInvitesList,
    deleteAllInvitesOfMember,
    existingInviteHasID,
    userHasInvite,
    addInvite,
    deleteInviteByIndex,
    getInviteAndIndexByID,
    deleteUsersExistingInvite,
    findSocketFromOwner,
    onPublicInvitesChange,
    IDLengthOfInvites
};
