// src/server/game/seeksmanager/acceptSeek.ts

/**
 * Handles the `acceptseek` lobby action and the challenge page's `accept`: turning an open
 * seek into a live game under the id it reserved, and sending the sockets that waited on
 * it — the lobby's, or the challenge page's — where they go next.
 *
 * The seek's terms become the game's — `gameManager.ts` builds it from there.
 * Withdrawing a seek instead of accepting it lives in `cancelSeek.ts`.
 */

import type { Player } from '../../../shared/chess/util/typeutil.js';
import type { CustomWebSocket } from '../../socket/socketTypes.js';
import type { PlayerAssignments } from '../gamemanager/serverGameTypes.js';

import logEvents from '../../utility/logEvents.js';
import socketSend from '../../socket/socketSend.js';
import gameUtility from '../gamemanager/gameUtility.js';
import gameManager from '../gamemanager/gameManager.js';
import activeSeeks from './activeSeeks.js';
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
		return socketSend.send(ws, 'general', 'toast', ws.t.responses.seeks.already_in_game);
	}

	// Does the seek still exist?
	const seek = activeSeeks.getByID(id);
	if (!seek) {
		socketSend.send(ws, 'general', 'toast', ws.t.responses.seeks.game_aborted);
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
		return socketSend.send(ws, 'general', 'toast', ws.t.responses.seeks.rated_requires_signin);
	}

	// A private seek's owner waits on its challenge page, a public one's on the lobby.
	const waitingSockets = seek.private ? seek.private.subscribers : lobbySubscribers.getAll();
	const player1Socket = socketLookups.findOfOwner(waitingSockets, seek.owner, seek.ownerTab); // Could be undefined occasionally
	const player2Socket = ws;

	// Assign each player a color based on their seek info. Add their socket just in case
	const assignments: PlayerAssignments = {};
	for (const [strcolor, identifier] of Object.entries(
		gameUtility.assignWhiteBlackPlayersFromSeek(seek.color, seek.owner, ws.metadata.memberInfo),
	)) {
		const player = Number(strcolor) as Player;
		const is_seek_accepter = memberInfoUtil.eq(identifier, player2Socket.metadata.memberInfo);
		assignments[player] = {
			identifier,
			socket: is_seek_accepter ? player2Socket : player1Socket,
			// A public seek only outlives its owner's disconnect by the lobby's cushion,
			// so an owner missing from one is mid-reconnect rather than away by choice.
			leftVoluntarily: is_seek_accepter ? false : seek.private?.ownerAway?.leftVoluntarily,
		};
	}

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

	if (seek.private) challengeManager.broadcastGameStart(seek.private.subscribers, assignments);
}

// Exports ---------------------------------------------------------------------

export default {
	accept,
};
