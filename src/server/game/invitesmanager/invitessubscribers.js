
/*
 * This script stores the list of websockets currently subscribed
 * to the invites list.
 * 
 * On demand, it broadcasts new changes to the list out to the
 * players, and it broadcasts the active game count.
 */


// List of clients currently subscribed to invites list events!
const subscribedClients = {}; // { id: ws }

const printNewAndClosedSubscriptions = false;
const printSubscriberCount = true;


/**
 * Broadcasts a message to all invites subscribers.
 * @param {string} action - The action of the socket message (i.e. "inviteslist")
 * @param {*} message - The message contents
 * @param {number} [replyTo] If applicable, in the incoming socket message this message is the reply to.
 */
function broadcastToAllInviteSubs(action, message, replyTo) {
    const subbedClientsKeys = Object.keys(subscribedClients); // []
    for (let id of subbedClientsKeys) {
        ws.metadata.sendmessage(ws, "invites", action, message, replyto) // In order: socket, sub, action, value
    }
}

function sendMessageToSocket(ws, message) {
    ws.metadata.sendmessage(ws, "invites", "inviteslist", message, replyto) // In order: socket, sub, action, value
}

function sendClientInvitesList(ws, invitesList = getPublicInvitesListSafe(), currentGameCount = getActiveGameCount(), replyto) {
    invitesList = addMyPrivateInviteToList(ws, invitesList)
    const message = { invitesList, currentGameCount }
    ws.metadata.sendmessage(ws, "invites", action, message, replyto) // In order: socket, sub, action, value
}