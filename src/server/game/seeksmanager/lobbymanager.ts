// src/server/game/seeksmanager/lobbymanager.ts

/**
 * Turns a connection into a lobby viewer and back: subscribing a socket, handing it
 * the full lobby state, unsubscribing it, and holding its seeks through a brief
 * cushion so a network blip doesn't cost the user their seek.
 *
 * `activeseeks.ts` owns the seeks themselves, and `lobbysubscribers.ts` the socket set.
 * Everything here is a side-effect on top of those two.
 *
 * Each module broadcasts its own state: the seek list from `activeseeks.ts`, everything
 * else from here. No `gamesockets.ts` equivalent — one audience means nothing to address.
 */

import type { AuthMemberInfo } from '../../types.js';
import type { CustomWebSocket } from '../../socket/socketTypes.js';
import type { LobbyStateMessage } from '../../../shared/clientbound.js';

import socketsend from '../../socket/socketSend.js';
import activeseeks from './activeseeks.js';
import activeplayers from '../gamemanager/activeplayers.js';
import memberinfoutil from '../../utility/memberinfoutil.js';
import lobbysubscribers from './lobbysubscribers.js';

// Constants -------------------------------------------------------------------------------------

/**
 * Time to allow the client to reconnect after an UNEXPECTED (not purposeful)
 * socket closure before any seek of theirs is deleted!
 */
const DISCONNECT_CUSHION_MS = 5000; // 5 seconds

// State -----------------------------------------------------------------------------------------

/**
 * An object containing usernames for the keys, and setTimeout timer ID's for the values,
 * that represent the timers that are currently active to delete all a player's seeks
 * since they've disconnected.
 */
const timersMember: Record<number, ReturnType<typeof setTimeout>> = {};
/**
 * An object containing browser-ids for the keys, and setTimeout timer ID's for the values,
 * that represent the timers that are currently active to delete all a browser's seeks
 * since they've disconnected.
 */
const timersBrowser: Record<string, ReturnType<typeof setTimeout>> = {};

// Subscribing -----------------------------------------------------------------------------------

/**
 * Subscribes a socket to the lobby, sends them the full lobby state,
 * and cancels any active timers to delete their seeks if their
 * socket was previously closed by a network interruption.
 */
function subscribe(ws: CustomWebSocket): void {
	if (ws.metadata.subscriptions.lobby) return; // Already subscribed. Happens occasionally

	lobbysubscribers.add(ws);

	sendClientLobbyState(ws);
	broadcastViewerCount(ws); // Notify all existing subscribers of the incremented count
	cancelCushionTimer(ws);
}

/**
 * Unsubscribes a socket from the lobby, and deletes its owner's seeks — at once, or
 * after a cushion, so a dropped connection doesn't immediately cost them their seek.
 * @param involuntary - Whether the socket closed on its own (a network interruption)
 * rather than at the client's request. Their seeks then outlive the cushion.
 */
function unsubscribe(ws: CustomWebSocket, involuntary?: boolean): void {
	lobbysubscribers.remove(ws);
	broadcastViewerCount(); // Notify remaining subscribers of the decremented count

	const owner = ws.metadata.memberInfo;

	if (!involuntary) return deleteSeeksIfNotConnected(owner); // Delete their existing seeks

	// The closure WASN'T by choice! Set a 5s timer to give them time to reconnect before deleting their seek!
	// console.log("Setting a 5-second timer to delete a user's seek!");
	const timeout = setTimeout(() => deleteSeeksIfNotConnected(owner), DISCONNECT_CUSHION_MS);
	if (owner.signedIn) timersMember[owner.user_id] = timeout;
	else timersBrowser[owner.browser_id] = timeout;
}

/**
 * Returns the first socket subscribed to the seeks list that matches the member/browser property.
 * Typically called when you need to inform a player their seek was accepted.
 * @returns The websocket, if found, otherwise undefined.
 */
function findSocketFromOwner(owner: AuthMemberInfo): CustomWebSocket | undefined {
	// Iterate through all sockets, until you find one that matches the authentication of our seek owner
	for (const ws of lobbysubscribers.getAll()) {
		if (memberinfoutil.eq(owner, ws.metadata.memberInfo)) return ws;
	}
	// They must have disconnected involuntarily, and be within
	// that 5-second cushion before their seek is deleted.
	return;
}

// Seek Cushion ----------------------------------------------------------------------------------

/**
 * Cancels any running timers to delete a users seeks from a network interruption.
 * @param ws - The socket of the new seeks subscriber
 */
function cancelCushionTimer(ws: CustomWebSocket): void {
	if (ws.metadata.memberInfo.signedIn) {
		clearTimeout(timersMember[ws.metadata.memberInfo.user_id]);
		delete timersMember[ws.metadata.memberInfo.user_id];
	} else if (ws.metadata) {
		clearTimeout(timersBrowser[ws.metadata.memberInfo.browser_id]);
		delete timersBrowser[ws.metadata.memberInfo.browser_id];
	}
}

/**
 * Deletes the user's seeks, but only if they no longer have an active connection —
 * another tab of theirs may still be subscribed, or they may have reconnected
 * within the cushion. Runs when the cushion elapses, or on a voluntary unsub.
 */
function deleteSeeksIfNotConnected(info: AuthMemberInfo): void {
	// Don't delete seek if there is an active connection
	const hasActiveConnection = lobbysubscribers.hasUser(info);
	if (hasActiveConnection) {
		// console.log(`${signedIn ? `Member "${identifier}"` : `Browser "${identifier}"`} is still connected, not deleting seek.`);
		return;
	}

	// Proceed with deleting the seek if not connected
	activeseeks.deleteOfUser(info);
}

// Broadcasts ------------------------------------------------------------------------------------

/**
 * Sends the full lobby state (seeks list, viewer count, and whether they're already
 * in a game) to a single client. Called once when a socket first subscribes — everything the
 * client needs to be fully in sync arrives in this one message.
 * @param ws - The socket of the player to send the state to.
 */
function sendClientLobbyState(ws: CustomWebSocket): void {
	const seekslist = activeseeks.getAllSafe();
	const viewercount = lobbysubscribers.getCount();

	// If they're already in a game, tell them. They're only taken into it if we still owe them
	// the notice (their seek was accepted during a disconnect cushion, so they never got the
	// push at creation) — otherwise they just get the banner to rejoin it.
	const gameID = activeplayers.getGameID(ws.metadata.memberInfo);
	const ingame =
		gameID !== undefined
			? {
					id: gameID,
					role: activeplayers.getRole(ws.metadata.memberInfo),
					navigate: activeplayers.consumeNavigateNotice(ws.metadata.memberInfo),
				}
			: undefined;

	const message: LobbyStateMessage = {
		seekslist,
		ourseekid: activeseeks.getIDOfUser(ws.metadata.memberInfo),
		viewercount,
		ingame,
	};
	socketsend.send(ws, 'lobby', 'lobbystate', message); // In order: socket, sub, action, value
}

/**
 * Broadcasts the current viewer count to all subscribed clients.
 * Called when the subscriber count changes (i.e. on sub/unsub), not on seek changes.
 * @param skipWs - Optional socket to exclude from the broadcast (e.g. the socket that just subscribed, who already received the count in their lobbystate).
 */
function broadcastViewerCount(skipWs?: CustomWebSocket): void {
	const count = lobbysubscribers.getCount();
	for (const ws of lobbysubscribers.getAll()) {
		if (ws === skipWs) continue;
		socketsend.send(ws, 'lobby', 'viewercount', count);
	}
}

/**
 * Broadcasts the member's current in-game status to ALL their lobby-subscribed sockets, so
 * every open lobby tab shows/hides its in-game banner (or navigates). Call right after adding
 * them to, or removing them from, the active games list.
 * @param navigatingSocket - The socket that asked for the game, if any. It's taken into the
 * game page, while their other lobby tabs merely show the banner to rejoin it.
 */
function broadcastMemberInGameStatus(
	user: AuthMemberInfo,
	navigatingSocket?: CustomWebSocket,
): void {
	const gameID = activeplayers.getGameID(user);
	const role = activeplayers.getRole(user);
	for (const ws of lobbysubscribers.getAll()) {
		if (!memberinfoutil.eq(user, ws.metadata.memberInfo)) continue;
		if (gameID !== undefined)
			socketsend.send(ws, 'lobby', 'ingame', {
				id: gameID,
				role,
				navigate: ws === navigatingSocket,
			});
		else socketsend.send(ws, 'lobby', 'outgame', undefined);
	}
}

// Exports ---------------------------------------------------------------------------------------

export default {
	// Subscribing
	subscribe,
	unsubscribe,
	findSocketFromOwner,
	// Broadcasts
	broadcastViewerCount,
	broadcastMemberInGameStatus,
};
