// src/server/game/invitesmanager/invitessubscribers.ts

/*
 * This script stores the list of websockets currently subscribed
 * to the invites list.
 *
 * On demand, it broadcasts stuff out to the players.
 */

import type { AuthMemberInfo } from '../../types.js';
import type { CustomWebSocket } from '../../socket/socketutility.js';

import socketUtility from '../../socket/socketutility.js';
import { memberInfoEq } from './inviteutility.js';
import { sendSocketMessage } from '../../socket/sendsocketmessage.js';

/**
 * List of clients currently subscribed to invites list events, with their
 * socket id for the keys, and their socket for the value.
 */
const subscribedClients: Record<string, CustomWebSocket> = {}; // { id: ws }

const printNewAndClosedSubscriptions = false;
const printSubscriberCount = true;

/**
 * Returns the object containing all sockets currently subscribed to the invites list,
 * with their socket id for the keys, and their socket for the value.
 */
function getInviteSubscribers(): typeof subscribedClients {
	return subscribedClients;
}

/**
 * Broadcasts a message to all invites subscribers.
 * @param action - The action of the socket message (i.e. "inviteslist")
 * @param message - The message contents
 */
function broadcastToAllInviteSubs(action: string, message: any): void {
	for (const ws of Object.values(subscribedClients)) {
		sendSocketMessage(ws, 'invites', action, message); // In order: socket, sub, action, value
	}
}

/**
 * Adds a new socket to the invite subscriber list.
 */
function addSocketToInvitesSubs(ws: CustomWebSocket): void {
	const socketID = ws.metadata.id;
	if (subscribedClients[socketID])
		return console.error('Cannot sub socket to invites list because they already are!');

	subscribedClients[socketID] = ws;
	ws.metadata.subscriptions.invites = true;
	if (printNewAndClosedSubscriptions)
		console.log(
			`Subscribed client to invites list! Metadata: ${socketUtility.stringifySocketMetadata(ws)}`,
		);
	if (printSubscriberCount)
		console.log(`Invites subscriber count: ${Object.keys(subscribedClients).length}`);
}

/**
 * Removes a socket from the invite subscriber list.
 * DOES NOT delete any of their existing invites! That should be done before.
 */
function removeSocketFromInvitesSubs(ws: CustomWebSocket): void {
	if (!ws)
		return console.error("Can't remove socket from invites subs list because it's undefined!");

	const socketID = ws.metadata.id;
	if (!subscribedClients[socketID]) return; // Cannot unsub socket from invites list because they aren't subbed.

	delete subscribedClients[socketID];
	delete ws.metadata.subscriptions.invites;
	if (printNewAndClosedSubscriptions)
		console.log(
			`Unsubscribed client from invites list. Metadata: ${socketUtility.stringifySocketMetadata(ws)}`,
		);
	if (printSubscriberCount)
		console.log(`Invites subscriber count: ${Object.keys(subscribedClients).length}`);
}

/**
 * Checks if a member or browser ID has at least one active connection.
 * @returns true if the member or browser ID has at least one active connection, false otherwise.
 */
function doesUserHaveActiveConnection(info: AuthMemberInfo): boolean {
	return Object.values(subscribedClients).some((ws) => {
		return memberInfoEq(ws.metadata.memberInfo, info);
	});
}

export {
	getInviteSubscribers,
	broadcastToAllInviteSubs,
	addSocketToInvitesSubs,
	removeSocketFromInvitesSubs,
	doesUserHaveActiveConnection,
};
