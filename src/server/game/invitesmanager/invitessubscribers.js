
/*
 * This script stores the list of websockets currently subscribed
 * to the invites list.
 * 
 * On demand, it broadcasts stuff out to the players.
 */

const { Socket } = require('../TypeDefinitions.js')

/**
 * List of clients currently subscribed to invites list events, with their
 * socket id for the keys, and their socket for the value.
 */
const subscribedClients = {}; // { id: ws }

const printNewAndClosedSubscriptions = false;
const printSubscriberCount = true;


/**
 * Returns the object containing all sockets currently subscribed to the invites list,
 * with their socket id for the keys, and their socket for the value.
 * @returns {Object}
 */
function getInviteSubscribers() { return subscribedClients }

/**
 * Broadcasts a message to all invites subscribers.
 * @param {string} action - The action of the socket message (i.e. "inviteslist")
 * @param {*} message - The message contents
 * @param {number} [replyTo] If applicable, in the incoming socket message this message is the reply to.
 */
function broadcastToAllInviteSubs(action, message, replyTo) {
    for (let ws of Object.values(subscribedClients)) {
        ws.metadata.sendmessage(ws, "invites", action, message, replyTo) // In order: socket, sub, action, value
    }
}

/**
 * Adds a new socket to the invite subscriber list.
 * @param {Socket} ws 
 */
function addSocketToInvitesSubs(ws) {
    const socketID = ws.metadata.id;
    if (subscribedClients[socketID]) return console.error("Cannot sub socket to invites list because they already are!")

    subscribedClients[socketID] = ws;
    ws.metadata.subscriptions.invites = true;
    if (printNewAndClosedSubscriptions) console.log(`Subscribed client to invites list! Metadata: ${wsutility.stringifySocketMetadata(ws)}`)
    if (printSubscriberCount) console.log(`Invites subscriber count: ${Object.keys(subscribedClients).length}`)
}

/**
 * Removes a socket from the invite subscriber list.
 * @param {Socket} ws 
 */
function removeSocketFromInvitesSubs(ws) {
    if (ws == null) return console.error("Can't remove socket from invites subs list because it's undefined!")

    const socketID = ws.metadata.id;
    if (!subscribedClients[socketID]) return console.error("Cannot unsub socket from invites list because they aren't subbed!")

    delete subscribedClients[socketID];
    delete ws.metadata.subscriptions.invites
    if (printNewAndClosedSubscriptions) console.log(`Unsubscribed client from invites list. Metadata: ${wsutility.stringifySocketMetadata(ws)}`)
    if (printSubscriberCount) console.log(`Invites subscriber count: ${Object.keys(subscribedClients).length}`)
}





module.exports = {
    getInviteSubscribers,
    broadcastToAllInviteSubs,
    addSocketToInvitesSubs,
    removeSocketFromInvitesSubs,
}