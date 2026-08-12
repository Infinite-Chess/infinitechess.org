// src/server/game/seeksmanager/acceptseek.ts

/**
 * This script handles seek acceptance,
 * creating a new game if successful.
 */

import type { SeekId } from '../../../shared/domain.js';
import type { AuthMemberInfo } from '../../types.js';
import type { CustomWebSocket } from '../../socket/socketTypes.js';
import type { Player, PlayerGroup } from '../../../shared/chess/util/typeutil.js';

import gameutility from '../gamemanager/gameutility.js';
import { memberInfoEq } from '../../utility/memberInfoUtil.js';
import { logEventsAndPrint } from '../../middleware/logEvents.js';
import { sendSocketMessage } from '../../socket/socketSend.js';
import { isSocketInAnActiveGame } from '../gamemanager/activeplayers.js';
import { removeSocketFromLobbySubs } from './lobbysubscribers.js';
import { createGame, onGameCreationError } from '../gamemanager/gamemanager.js';
import {
	getSeekAndIndexByID,
	deleteSeekByIndex,
	deleteUsersExistingSeek,
	findSocketFromOwner,
	broadcastSeeks,
	broadcastViewerCount,
} from './lobbymanager.js';

/**
 * Attempts to accept a seek of given id.
 * @param ws - The socket performing this action
 * @param messageContents - The incoming socket message containing the seek id
 */
function acceptSeek(ws: CustomWebSocket, messageContents: SeekId): void {
	if (isSocketInAnActiveGame(ws)) {
		return sendSocketMessage(ws, 'general', 'notify', ws.t.responses.seeks.already_in_game);
	}

	// Does the seek still exist?
	const seekAndIndex = getSeekAndIndexByID(messageContents);
	if (!seekAndIndex) {
		sendSocketMessage(ws, 'general', 'notify', ws.t.responses.seeks.game_aborted);
		return;
	}

	const { seek, index } = seekAndIndex;

	const user = ws.metadata.memberInfo;

	// Make sure they are not accepting their own.
	if (memberInfoEq(user, seek.owner)) {
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
	if (deleteSeekByIndex(seek, index, { dontBroadcast: true })) deletedAnySeek = true;
	// Delete their existing seeks
	if (deleteUsersExistingSeek(user, { broadCastNewSeeks: false })) deletedAnySeek = true;

	// Start the game! Notify both players and tell them they've been subscribed to a game!

	const player1Socket = findSocketFromOwner(seek.owner); // Could be undefined occasionally
	const player2Socket = ws;

	// Assign each player a color based on their seek info. Add their socket just encase
	const assignments: PlayerGroup<{ identifier: AuthMemberInfo; socket?: CustomWebSocket }> = {};
	let seek_accepter: Player | undefined;
	for (const [strcolor, identifier] of Object.entries(
		gameutility.assignWhiteBlackPlayersFromSeek(seek.color, seek.owner, ws.metadata.memberInfo),
	)) {
		const player = Number(strcolor) as Player;
		const is_seek_accepter = memberInfoEq(identifier, player2Socket.metadata.memberInfo);
		if (is_seek_accepter) seek_accepter = player;
		assignments[player] = {
			identifier,
			socket: is_seek_accepter ? player2Socket : player1Socket,
		};
	}

	if (seek_accepter === undefined)
		throw Error("Seek accepter doesn't exist on accepted 2 player seek");

	try {
		createGame(
			{
				variant: seek.variant,
				time: seek.time,
				rated: seek.mode === 'rated',
				modifiers: seek.modifiers,
			},
			assignments,
		);
	} catch (error: unknown) {
		onGameCreationError(
			error,
			Object.values(assignments).map(({ socket }) => socket),
		);
		return;
	}

	// Unsubscribe them both from the lobby.
	if (player1Socket) removeSocketFromLobbySubs(player1Socket); // Could be undefined occasionally
	removeSocketFromLobbySubs(player2Socket);
	broadcastViewerCount(); // Notify the remaining lobby subscribers of the decremented viewer count

	// Broadcast the seeks list change after creating
	// the game, because the new game ups the game count.
	if (deletedAnySeek) broadcastSeeks();
}

export { acceptSeek };
