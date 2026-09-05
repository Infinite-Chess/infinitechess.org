// src/server/game/seeksmanager/acceptSeek.ts

/**
 * Handles the `acceptseek` lobby action: turning an open seek into a live game,
 * deleting both players' seeks and dropping them out of the lobby.
 *
 * The seek's terms become the game's — `gameManager.ts` builds it from there.
 * Withdrawing a seek instead of accepting it lives in `cancelSeek.ts`.
 */

import type { SeekId } from '../../../shared/transport/domain.js';
import type { AuthMemberInfo } from '../../types.js';
import type { CustomWebSocket } from '../../socket/socketTypes.js';
import type { Player, PlayerGroup } from '../../../shared/chess/util/typeutil.js';

import logEvents from '../../utility/logEvents.js';
import socketsend from '../../socket/socketSend.js';
import gameUtility from '../gamemanager/gameUtility.js';
import gameManager from '../gamemanager/gameManager.js';
import activeSeeks from './activeSeeks.js';
import lobbyManager from './lobbyManager.js';
import activePlayers from '../gamemanager/activePlayers.js';
import memberInfoUtil from '../../auth/memberInfoUtil.js';
import lobbySubscribers from './lobbySubscribers.js';

/**
 * Attempts to accept a seek of given id.
 * @param ws - The socket performing this action
 * @param messageContents - The incoming socket message containing the seek id
 */
function accept(ws: CustomWebSocket, messageContents: SeekId): void {
	if (activePlayers.hasSocket(ws)) {
		return socketsend.send(ws, 'general', 'toast', ws.t.responses.seeks.already_in_game);
	}

	// Does the seek still exist?
	const seek = activeSeeks.getByID(messageContents);
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
	if (activeSeeks.deleteByID(messageContents, { dontBroadcast: true })) deletedAnySeek = true;
	// Delete their existing seeks
	if (activeSeeks.deleteOfUser(user, { dontBroadcast: true })) deletedAnySeek = true;

	// Start the game! Notify both players and tell them they've been subscribed to a game!

	const player1Socket = lobbyManager.findSocketFromOwner(seek.owner, seek.ownerTab); // Could be undefined occasionally
	const player2Socket = ws;

	// Assign each player a color based on their seek info. Add their socket just encase
	const assignments: PlayerGroup<{ identifier: AuthMemberInfo; socket?: CustomWebSocket }> = {};
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
			{
				variant: seek.variant,
				time: seek.time,
				rated: seek.mode === 'rated',
				private: false, // Hardcoded until the "Challenge a friend" flow ships.
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

	// Unsubscribe them both from the lobby.
	if (player1Socket) lobbySubscribers.remove(player1Socket); // Could be undefined occasionally
	lobbySubscribers.remove(player2Socket);
	lobbyManager.broadcastViewerCount(); // Notify the remaining lobby subscribers of the decremented viewer count

	// Both deletions above were silenced so they collapse into this single broadcast.
	if (deletedAnySeek) activeSeeks.broadcast();
}

// Exports ---------------------------------------------------------------------

export default {
	accept,
};
