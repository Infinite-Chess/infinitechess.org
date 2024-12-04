
/*
 * This script stores the list of websockets currently subscribed
 * to the invites list.
 * 
 * On demand, it broadcasts stuff out to the players.
 */

import { sendSocketMessage } from '../../socket/sendSocketMessage.js';
import socketUtility from '../../socket/socketUtility.js';

/** @typedef {import("../../socket/socketUtility.js").CustomWebSocket} CustomWebSocket */

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
function getInviteSubscribers() { return subscribedClients; }

/**
 * Broadcasts a message to all invites subscribers.
 * @param {string} action - The action of the socket message (i.e. "inviteslist")
 * @param {*} message - The message contents
 */
function broadcastToAllInviteSubs(action, message) {
	for (const ws of Object.values(subscribedClients)) {
		sendSocketMessage(ws, "invites", action, message); // In order: socket, sub, action, value
	}
}

/**
 * Adds a new socket to the invite subscriber list.
 * @param {CustomWebSocket} ws 
 */
function addSocketToInvitesSubs(ws) {
	const socketID = ws.metadata.id;
	if (subscribedClients[socketID]) return console.error("Cannot sub socket to invites list because they already are!");

	subscribedClients[socketID] = ws;
	ws.metadata.subscriptions.invites = true;
	if (printNewAndClosedSubscriptions) console.log(`Subscribed client to invites list! Metadata: ${socketUtility.stringifySocketMetadata(ws)}`);
	if (printSubscriberCount) console.log(`Invites subscriber count: ${Object.keys(subscribedClients).length}`);
}

/**
 * Removes a socket from the invite subscriber list.
 * DOES NOT delete any of their existing invites! That should be done before.
 * @param {CustomWebSocket} ws 
 */
function removeSocketFromInvitesSubs(ws) {
	if (!ws) return console.error("Can't remove socket from invites subs list because it's undefined!");

	const socketID = ws.metadata.id;
	if (!subscribedClients[socketID]) return console.error("Cannot unsub socket from invites list because they aren't subbed!");

	delete subscribedClients[socketID];
	delete ws.metadata.subscriptions.invites;
	if (printNewAndClosedSubscriptions) console.log(`Unsubscribed client from invites list. Metadata: ${socketUtility.stringifySocketMetadata(ws)}`);
	if (printSubscriberCount) console.log(`Invites subscriber count: ${Object.keys(subscribedClients).length}`);
}

/**
 * Checks if a member or browser ID has at least one active connection.
 * @param {boolean} signedIn - Flag to specify if the identifier is for a signed-in member (true) or a browser ID (false).
 * @param {string} identifier - The identifier of the member (username for signed-in members) or browser ID (for non-signed-in users).
 * @returns {boolean} - Returns true if the member or browser ID has at least one active connection, false otherwise.
 */
function doesUserHaveActiveConnection(signedIn, identifier) {
	return Object.values(subscribedClients).some(ws => {
		if (signedIn) return ws.metadata.memberInfo.username === identifier;
		else return ws.metadata.cookies['browser-id'] === identifier;
	});
}



export {
	getInviteSubscribers,
	broadcastToAllInviteSubs,
	addSocketToInvitesSubs,
	removeSocketFromInvitesSubs,
	doesUserHaveActiveConnection,
};