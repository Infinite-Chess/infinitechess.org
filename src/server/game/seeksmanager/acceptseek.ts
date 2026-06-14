// src/server/game/seeksmanager/acceptseek.ts

/**
 * This script handles seek acceptance,
 * creating a new game if successful.
 */

import type { AuthMemberInfo } from '../../types.js';
import type { CustomWebSocket } from '../../socket/socketUtility.js';
import type { Player, PlayerGroup } from '../../../shared/chess/util/typeutil.js';

import * as z from 'zod';

import gameutility from '../gamemanager/gameutility.js';
import { createGame } from '../gamemanager/gamemanager.js';
import { memberInfoEq } from './seekutility.js';
import { logEventsAndPrint } from '../../middleware/logEvents.js';
import { sendSocketMessage } from '../../socket/sendSocketMessage.js';
import { isSocketInAnActiveGame } from '../gamemanager/activeplayers.js';
import { removeSocketFromLobbySubs } from './lobbysubscribers.js';
import {
	getSeekAndIndexByID,
	deleteSeekByIndex,
	deleteUsersExistingSeek,
	findSocketFromOwner,
	onPublicSeeksChange,
	IDLengthOfSeeks,
} from './lobbymanager.js';

/** The zod schema for validating the contents of the acceptseek message. */
const acceptseekschem = z.string().length(IDLengthOfSeeks);

type AcceptSeekMessage = z.infer<typeof acceptseekschem>;

/**
 * Attempts to accept a seek of given id.
 * @param ws - The socket performing this action
 * @param messageContents - The incoming socket message containing the seek id
 */
function acceptSeek(ws: CustomWebSocket, messageContents: AcceptSeekMessage): void {
	// { id, isPrivate }
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
			ws.t.responses.seeks.rated_requires_verified,
		);
	}

	// Accept the seek!

	let hadPublicSeek = false;
	// Delete the seek accepted.
	if (deleteSeekByIndex(seek, index, { dontBroadcast: true })) hadPublicSeek = true;
	// Delete their existing seeks
	if (deleteUsersExistingSeek(user, { broadCastNewSeeks: false })) hadPublicSeek = true;

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
		createGame(seek, assignments);
	} catch {
		// DB error (already logged)
		// Notify both parties a server error occurred
		for (const { socket: ws } of Object.values(assignments)) {
			if (!ws) continue;
			sendSocketMessage(
				ws,
				'general',
				'notifyerror',
				"Couldn't create game. A server error occurred. Please try again.",
			);
		}
		return;
	}

	// Unsubscribe them both from the lobby.
	if (player1Socket) removeSocketFromLobbySubs(player1Socket); // Could be undefined occasionally
	removeSocketFromLobbySubs(player2Socket);

	// Broadcast the seeks list change after creating the game,
	// because the new game ups the game count.
	if (hadPublicSeek) onPublicSeeksChange(); // Broadcast to all seeks list subscribers!
}

export { acceptSeek, acceptseekschem };
