// src/server/game/seeksmanager/lobbysubscribers.ts

/*
 * This script stores the list of websockets currently subscribed
 * to the lobby.
 *
 * On demand, it broadcasts stuff out to the players.
 */

import type { AuthMemberInfo } from '../../types.js';
import type { CustomWebSocket } from '../../socket/socketUtility.js';

import { memberInfoEq } from './seekutility.js';
import { sendSocketMessage } from '../../socket/sendSocketMessage.js';

/** Set of clients currently subscribed to the lobby. */
const subscribedClients: Set<CustomWebSocket> = new Set();

const printSubscriberCount = false;

/**
 * Returns an iterator over all sockets currently subscribed to the lobby.
 */
function getLobbySubscribers(): SetIterator<CustomWebSocket> {
	return subscribedClients.values();
}

/**
 * Broadcasts a message to all lobby subscribers.
 * @param action - The action of the socket message
 * @param message - The message contents
 */
function broadcastToAllLobbySubs(action: string, message: any): void {
	for (const ws of subscribedClients) {
		sendSocketMessage(ws, 'lobby', action, message); // In order: socket, sub, action, value
	}
}

/**
 * Adds a new socket to the lobby subscriber list.
 */
function addSocketToLobbySubs(ws: CustomWebSocket): void {
	if (subscribedClients.has(ws))
		return console.error('Cannot sub socket to lobby because they already are!');

	subscribedClients.add(ws);
	ws.metadata.subscriptions.lobby = true;

	if (printSubscriberCount) console.log(`Lobby subscriber count: ${subscribedClients.size}`);
}

/**
 * Removes a socket from the lobby subscriber list.
 * DOES NOT delete any of their existing seeks! That should be done before.
 */
function removeSocketFromLobbySubs(ws: CustomWebSocket): void {
	if (!ws)
		return console.error("Can't remove socket from lobby subs list because it's undefined!");

	if (!subscribedClients.has(ws)) return; // Cannot unsub socket from lobby because they aren't subbed.

	subscribedClients.delete(ws);
	delete ws.metadata.subscriptions.lobby;

	if (printSubscriberCount) console.log(`Lobby subscriber count: ${subscribedClients.size}`);
}

/** Returns the number of sockets currently subscribed to the lobby. */
function getSubscriberCount(): number {
	return subscribedClients.size;
}

/**
 * Checks if a member or browser ID has at least one active connection.
 * @returns true if the member or browser ID has at least one active connection, false otherwise.
 */
function doesUserHaveActiveConnection(info: AuthMemberInfo): boolean {
	for (const ws of subscribedClients) {
		if (memberInfoEq(ws.metadata.memberInfo, info)) return true;
	}
	return false;
}

export {
	getLobbySubscribers,
	getSubscriberCount,
	broadcastToAllLobbySubs,
	addSocketToLobbySubs,
	removeSocketFromLobbySubs,
	doesUserHaveActiveConnection,
};
