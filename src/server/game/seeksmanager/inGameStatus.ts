// src/server/game/seeksmanager/inGameStatus.ts

/**
 * Tells a user's seek pages whether they're in a game: their lobby tabs, which show the
 * rejoin banner (or navigate), and their challenge-page tabs, which may not accept while in one.
 */

import type { AuthMemberInfo } from '../../types.js';
import type { CustomWebSocket } from '../../socket/socketTypes.js';

import socketSend from '../../socket/socketSend.js';
import activeSeeks from './activeSeeks.js';
import activePlayers from '../gamemanager/activePlayers.js';
import memberInfoUtil from '../../auth/memberInfoUtil.js';
import lobbySubscribers from './lobbySubscribers.js';

// Functions -------------------------------------------------------------------

/**
 * Broadcasts the user's current in-game status to ALL their lobby and challenge-page sockets.
 * Call right after adding them to, or removing them from, the active games list.
 * @param navigatingSocket - The socket that asked for the game, if any. A lobby tab it names is
 * taken into the game page, while their other lobby tabs merely show the banner to rejoin it.
 */
function broadcast(user: AuthMemberInfo, navigatingSocket?: CustomWebSocket): void {
	const entry = activePlayers.getEntry(user);

	// Lobby tabs
	for (const ws of lobbySubscribers.getAll()) {
		if (!memberInfoUtil.eq(user, ws.metadata.memberInfo)) continue;
		if (entry === undefined) socketSend.send(ws, 'lobby', 'outgame', undefined);
		else
			socketSend.send(ws, 'lobby', 'ingame', {
				id: entry.gameID,
				role: entry.role,
				navigate: ws === navigatingSocket,
			});
	}

	// Challenge-page tabs
	for (const ws of activeSeeks.getAllChallengeSockets()) {
		if (!memberInfoUtil.eq(user, ws.metadata.memberInfo)) continue;
		if (entry === undefined) socketSend.send(ws, 'challenge', 'outgame', undefined);
		else socketSend.send(ws, 'challenge', 'ingame', { id: entry.gameID, role: entry.role });
	}
}

// Exports ---------------------------------------------------------------------

export default { broadcast };
