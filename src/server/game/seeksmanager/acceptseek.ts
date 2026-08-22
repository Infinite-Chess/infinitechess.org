// src/server/game/seeksmanager/acceptseek.ts

/**
 * Handles the `acceptseek` lobby action: turning an open seek into a live game,
 * deleting both players' seeks and dropping them out of the lobby.
 *
 * The seek's terms become the game's — `gamemanager.ts` builds it from there.
 * Withdrawing a seek instead of accepting it lives in `cancelseek.ts`.
 */

import type { SeekId } from '../../../shared/domain.js';
import type { AuthMemberInfo } from '../../types.js';
import type { CustomWebSocket } from '../../socket/socketTypes.js';
import type { Player, PlayerGroup } from '../../../shared/chess/util/typeutil.js';

import gameutility from '../gamemanager/gameutility.js';
import gamemanager from '../gamemanager/gamemanager.js';
import activeseeks from './activeseeks.js';
import lobbymanager from './lobbymanager.js';
import activeplayers from '../gamemanager/activeplayers.js';
import memberinfoutil from '../../utility/memberinfoutil.js';
import lobbysubscribers from './lobbysubscribers.js';
import { logEventsAndPrint } from '../../utility/logEvents.js';
import { sendSocketMessage } from '../../socket/socketSend.js';

/**
 * Attempts to accept a seek of given id.
 * @param ws - The socket performing this action
 * @param messageContents - The incoming socket message containing the seek id
 */
function accept(ws: CustomWebSocket, messageContents: SeekId): void {
	if (activeplayers.hasSocket(ws)) {
		return sendSocketMessage(ws, 'general', 'notify', ws.t.responses.seeks.already_in_game);
	}

	// Does the seek still exist?
	const seek = activeseeks.getByID(messageContents);
	if (!seek) {
		sendSocketMessage(ws, 'general', 'notify', ws.t.responses.seeks.game_aborted);
		return;
	}

	const user = ws.metadata.memberInfo;

	// Make sure they are not accepting their own.
	if (memberinfoutil.eq(user, seek.owner)) {
		logEventsAndPrint('Player tried to accept their own seek!', 'errLog');
		return;
	}

	// Make sure it's legal for them to accept. (Not legal if they are a guest, and the seek is RATED)
	if (seek.mode === 'rated' && !user.signedIn) {
		return sendSocketMessage(
			ws,
			'general',
			'notify',
			ws.t.responses.seeks.rated_requires_signin,
		);
	}

	// Accept the seek!

	let deletedAnySeek = false;
	// Delete the seek accepted.
	if (activeseeks.deleteByID(messageContents, { dontBroadcast: true })) deletedAnySeek = true;
	// Delete their existing seeks
	if (activeseeks.deleteOfUser(user, { dontBroadcast: true })) deletedAnySeek = true;

	// Start the game! Notify both players and tell them they've been subscribed to a game!

	const player1Socket = lobbymanager.findSocketFromOwner(seek.owner); // Could be undefined occasionally
	const player2Socket = ws;

	// Assign each player a color based on their seek info. Add their socket just encase
	const assignments: PlayerGroup<{ identifier: AuthMemberInfo; socket?: CustomWebSocket }> = {};
	let seek_accepter: Player | undefined;
	for (const [strcolor, identifier] of Object.entries(
		gameutility.assignWhiteBlackPlayersFromSeek(seek.color, seek.owner, ws.metadata.memberInfo),
	)) {
		const player = Number(strcolor) as Player;
		const is_seek_accepter = memberinfoutil.eq(identifier, player2Socket.metadata.memberInfo);
		if (is_seek_accepter) seek_accepter = player;
		assignments[player] = {
			identifier,
			socket: is_seek_accepter ? player2Socket : player1Socket,
		};
	}

	if (seek_accepter === undefined)
		throw Error("Seek accepter doesn't exist on accepted 2 player seek");

	try {
		gamemanager.createGame(
			{
				variant: seek.variant,
				time: seek.time,
				rated: seek.mode === 'rated',
				modifiers: seek.modifiers,
			},
			assignments,
		);
	} catch (error: unknown) {
		gamemanager.onGameCreationError(
			error,
			Object.values(assignments).map(({ socket }) => socket),
		);
		return;
	}

	// Unsubscribe them both from the lobby.
	if (player1Socket) lobbysubscribers.remove(player1Socket); // Could be undefined occasionally
	lobbysubscribers.remove(player2Socket);
	lobbymanager.broadcastViewerCount(); // Notify the remaining lobby subscribers of the decremented viewer count

	// Both deletions above were silenced so they collapse into this single broadcast.
	if (deletedAnySeek) activeseeks.broadcast();
}

// Exports ---------------------------------------------------------------------------------------

export default {
	accept,
};
