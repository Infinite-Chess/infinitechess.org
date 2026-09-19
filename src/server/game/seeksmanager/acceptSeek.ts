// src/server/game/seeksmanager/acceptSeek.ts

/**
 * Handles the `acceptseek` lobby action and the challenge page's `accept`: turning an open
 * seek into a live game under the id it reserved, deleting both players' seeks, and sending
 * the sockets that waited on it — the lobby's, or the challenge page's — where they go next.
 *
 * The seek's terms become the game's — `gameManager.ts` builds it from there.
 * Withdrawing a seek instead of accepting it lives in `cancelSeek.ts`.
 */

import type { Player } from '../../../shared/chess/util/typeutil.js';
import type { CustomWebSocket } from '../../socket/socketTypes.js';
import type { PlayerAssignments } from '../gamemanager/serverGameTypes.js';

import logEvents from '../../utility/logEvents.js';
import socketsend from '../../socket/socketSend.js';
import gameUtility from '../gamemanager/gameUtility.js';
import gameManager from '../gamemanager/gameManager.js';
import activeSeeks from './activeSeeks.js';
import lobbyManager from './lobbyManager.js';
import activePlayers from '../gamemanager/activePlayers.js';
import socketLookups from '../../socket/socketLookups.js';
import memberInfoUtil from '../../auth/memberInfoUtil.js';
import challengeManager from './challengeManager.js';
import lobbySubscribers from './lobbySubscribers.js';

/**
 * Attempts to accept a seek of given id.
 * @param ws - The socket performing this action
 * @param id - The id of the seek to accept.
 */
function accept(ws: CustomWebSocket, id: number): void {
	if (activePlayers.hasSocket(ws)) {
		return socketsend.send(ws, 'general', 'toast', ws.t.responses.seeks.already_in_game);
	}

	// Does the seek still exist?
	const seek = activeSeeks.getByID(id);
	if (!seek) {
		socketsend.send(ws, 'general', 'toast', ws.t.responses.seeks.game_aborted);
		return;
	}

	const user = ws.metadata.memberInfo;

	// Make sure they are not accepting their own.
	if (memberInfoUtil.eq(user, seek.owner)) {
		logEvents.addAndPrint('Player tried to accept their own seek!', 'errLog');
		return;
	}

	// Make sure it's legal for them to accept. (Not legal if they are a guest, and the seek is RATED)
	if (seek.mode === 'rated' && !user.signedIn) {
		return socketsend.send(ws, 'general', 'toast', ws.t.responses.seeks.rated_requires_signin);
	}

	// Accept the seek!

	let deletedAnySeek = false;
	// Delete the seek accepted.
	if (activeSeeks.deleteByID(id, { dontBroadcast: true, becomingGame: true }))
		deletedAnySeek = true;
	// Delete their existing seeks
	if (activeSeeks.deleteOfUser(user, { dontBroadcast: true })) deletedAnySeek = true;

	// Start the game! Notify both players and tell them they've been subscribed to a game!

	// A private seek's owner waits on its challenge page, a public one's on the lobby.
	const ownerSockets = seek.private ? seek.private.subscribers : lobbySubscribers.getAll();
	const player1Socket = socketLookups.findOfOwner(ownerSockets, seek.owner, seek.ownerTab); // Could be undefined occasionally
	const player2Socket = ws;

	// Assign each player a color based on their seek info. Add their socket just in case
	const assignments: PlayerAssignments = {};
	let seek_accepter: Player | undefined;
	for (const [strcolor, identifier] of Object.entries(
		gameUtility.assignWhiteBlackPlayersFromSeek(seek.color, seek.owner, ws.metadata.memberInfo),
	)) {
		const player = Number(strcolor) as Player;
		const is_seek_accepter = memberInfoUtil.eq(identifier, player2Socket.metadata.memberInfo);
		if (is_seek_accepter) seek_accepter = player;
		assignments[player] = {
			identifier,
			socket: is_seek_accepter ? player2Socket : player1Socket,
		};
	}

	if (seek_accepter === undefined)
		throw Error("Seek accepter doesn't exist on accepted 2 player seek");

	try {
		gameManager.createGame(
			seek.id,
			{
				variant: seek.variant,
				time: seek.time,
				rated: seek.mode === 'rated',
				private: seek.private !== undefined,
				modifiers: seek.modifiers,
			},
			assignments,
		);
	} catch (error: unknown) {
		gameManager.onGameCreationError(
			error,
			Object.values(assignments).map(({ socket }) => socket),
		);
		return;
	}

	if (seek.private) {
		challengeManager.broadcastGameStart(seek.private.subscribers, assignments);
	} else {
		// Unsubscribe them both from the lobby.
		if (player1Socket) lobbySubscribers.remove(player1Socket); // Could be undefined occasionally
		lobbySubscribers.remove(player2Socket);
		lobbyManager.broadcastViewerCount(); // Notify the remaining lobby subscribers of the decremented viewer count
	}

	// Both deletions above were silenced so they collapse into this single broadcast.
	if (deletedAnySeek) activeSeeks.broadcast();
}

// Exports ---------------------------------------------------------------------

export default {
	accept,
};
