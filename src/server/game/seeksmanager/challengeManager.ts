// src/server/game/seeksmanager/challengeManager.ts

/**
 * Turns a connection into a challenge-page viewer and back: subscribing a socket,
 * sending the page's state, and unsubscribing it. Keeps a private challenge open while
 * its owner is present, with a grace period when their last challenge page disconnects.
 *
 * `activeSeeks.ts` owns the seeks and their page sockets, including detaching viewers
 * and sending `gone` when a seek is deleted. This module manages subscriptions and
 * expiry, and directs players and onlookers to the game when a challenge is accepted.
 */

import type { Player } from '../../../shared/chess/util/typeutil.js';
import type { PrivateSeek } from './seekUtility.js';
import type { CustomWebSocket } from '../../socket/socketTypes.js';
import type { PlayerAssignments } from '../gamemanager/serverGameTypes.js';
import type { ChallengeStateMessage } from '../../../shared/transport/clientbound.js';

import socketsend from '../../socket/socketSend.js';
import seekUtility from './seekUtility.js';
import activeSeeks from './activeSeeks.js';
import gameSockets from '../gamemanager/gameSockets.js';
import activeGames from '../gamemanager/activeGames.js';
import gamesManager from '../../database/gamesManager.js';
import activePlayers from '../gamemanager/activePlayers.js';
import deadGameState from '../gamemanager/deadGameState.js';
import socketLookups from '../../socket/socketLookups.js';
import memberInfoUtil from '../../auth/memberInfoUtil.js';

// Constants -------------------------------------------------------------------

/** How long a private seek outlives its owner having no challenge page open. */
const EXPIRY_MS = 1000 * 60 * 10; // 10 minutes

// Subscribing -----------------------------------------------------------------

/**
 * Subscribes a socket to the challenge page of the given id, and answers it with the page's
 * state. A socket is only retained while the id names an open private seek — otherwise it's
 * just told where to go.
 * @throws If a database error occurs.
 */
function subscribe(ws: CustomWebSocket, id: number): void {
	// A page views one challenge. Only a hand-crafted client re-subscribes an attached socket.
	if (ws.metadata.subscriptions.challenge) unsubscribe(ws);

	const seek = activeSeeks.getByID(id);
	if (seek === undefined || !seekUtility.isPrivate(seek)) {
		socketsend.send(ws, 'challenge', 'challengestate', resolveClosedState(ws, id));
		return;
	}

	seek.private.subscribers.add(ws);
	ws.metadata.subscriptions.challenge = { id };
	// The owner is present again.
	if (memberInfoUtil.eq(ws.metadata.memberInfo, seek.owner)) cancelExpiry(seek);

	const entry = activePlayers.getEntry(ws.metadata.memberInfo);
	const ingame = entry && { id: entry.gameID, role: entry.role };
	socketsend.send(ws, 'challenge', 'challengestate', { kind: 'open', ingame });
}

/**
 * Resolves where a tab goes once its id names no open private seek: to the game page whenever
 * it exists — for a player, only from the one tab owed the navigate — else home.
 * @throws If a database error occurs.
 */
function resolveClosedState(ws: CustomWebSocket, id: number): ChallengeStateMessage {
	const user = ws.metadata.memberInfo;

	let role: Player | undefined;
	const game = activeGames.getByID(id);
	if (game) role = gameSockets.getRole(game, ws);
	else if (gamesManager.isLogged(id)) {
		// Dead guests aren't identifiable, so a guest player is treated as an onlooker.
		role = user.signedIn ? deadGameState.resolveParticipantColor(id, user.user_id) : undefined;
	} else return { kind: 'gone' }; // The game page would 404.

	if (role === undefined) return { kind: 'game' }; // An onlooker
	// Only the player's tab owed the navigate goes in, consuming it. Their others go home.
	const owed =
		activePlayers.getEntry(user)?.gameID === id && activePlayers.consumeNavigateNotice(user);
	return owed ? { kind: 'game', role } : { kind: 'gone' };
}

/** Detaches a subscribed socket, starting expiry if it was the owner's last connection. */
function unsubscribe(ws: CustomWebSocket): void {
	const id = ws.metadata.subscriptions.challenge!.id; // Guaranteed: only called on a subscribed socket.
	delete ws.metadata.subscriptions.challenge;

	// Guaranteed open and private: a socket is only retained for one, and deleting it detaches them all.
	const seek = activeSeeks.getByID(id) as PrivateSeek;
	seek.private.subscribers.delete(ws);

	const isOwner = memberInfoUtil.eq(ws.metadata.memberInfo, seek.owner);
	if (isOwner && !socketLookups.hasUser(seek.private.subscribers, seek.owner)) armExpiry(seek);
}

// Expiry ----------------------------------------------------------------------

/** Starts the owner-away clock: the seek is deleted unless an owner challenge socket connects in time. */
function armExpiry(seek: PrivateSeek): void {
	seek.private.expiry = setTimeout(() => activeSeeks.deleteByID(seek.id), EXPIRY_MS);
}

/** Stops the owner-away clock, if running. */
function cancelExpiry(seek: PrivateSeek): void {
	clearTimeout(seek.private.expiry);
	delete seek.private.expiry;
}

// Broadcasts ------------------------------------------------------------------

/**
 * Tells a private seek's page sockets where to go now that it became a game: each player's
 * own socket into it as that player, their other tabs home, and everyone else in as an onlooker.
 * @param subscribers - The seek's page sockets.
 * @param assignments - The game's players, each with the socket taken into it, if connected.
 */
function broadcastGameStart(
	subscribers: Set<CustomWebSocket>,
	assignments: PlayerAssignments,
): void {
	for (const ws of subscribers) {
		socketsend.send(ws, 'challenge', 'challengestate', resolveGameStart(ws, assignments));
	}
}

/** Where one of the page's sockets goes when its challenge becomes a game. */
function resolveGameStart(
	ws: CustomWebSocket,
	assignments: PlayerAssignments,
): ChallengeStateMessage {
	for (const [strcolor, { identifier, socket }] of Object.entries(assignments)) {
		if (ws === socket) return { kind: 'game', role: Number(strcolor) as Player };
		if (memberInfoUtil.eq(identifier, ws.metadata.memberInfo)) return { kind: 'gone' }; // A player's other tab
	}
	return { kind: 'game' }; // An onlooker
}

// Exports ---------------------------------------------------------------------

export default {
	// Subscribing
	subscribe,
	unsubscribe,
	// Expiry
	armExpiry,
	// Broadcasts
	broadcastGameStart,
};
