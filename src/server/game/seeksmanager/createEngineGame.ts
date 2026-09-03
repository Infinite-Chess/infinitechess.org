// src/server/game/seeksmanager/createEngineGame.ts

/**
 * Handles the `createenginegame` lobby action: starting a game against the server's
 * engine at once, with no seek posted and no opponent to wait for.
 *
 * Bypasses the lobby, but shares `createSeek.ts`'s variant validation and
 * `gameManager.ts`'s creation pipeline — an engine game is a live game like any other.
 */

import type { CustomWebSocket } from '../../socket/socketTypes.js';
import type { CreateEngineGameMessage } from '../../../shared/transport/serverbound.js';

import apeironcard from '../../../shared/chess/engines/apeironcard.js';
import typeutil, { players } from '../../../shared/chess/util/typeutil.js';
import engineregistry, { ValidEngine } from '../../../shared/chess/util/engineregistry.js';

import manifest from '../../config/manifest.js';
import logEvents from '../../utility/logEvents.js';
import createSeek from './createSeek.js';
import socketsend from '../../socket/socketSend.js';
import gameManager from '../gamemanager/gameManager.js';
import activeSeeks from './activeSeeks.js';
import lobbyManager from './lobbyManager.js';
import activePlayers from '../gamemanager/activePlayers.js';
import lobbySubscribers from './lobbySubscribers.js';

// Constants -------------------------------------------------------------------

/** The engine used for online computer games. */
const ONLINE_ENGINE: ValidEngine = 'apeiron';

// Functions -------------------------------------------------------------------

/**
 * Creates an engine game from the owner's websocket message. On success, createGame's
 * 'ingame' push navigates the client; on failure, notifies the client with the reason.
 */
function create(ws: CustomWebSocket, body: CreateEngineGameMessage): void {
	if (activePlayers.hasSocket(ws))
		return socketsend.send(ws, 'general', 'toast', ws.t.responses.seeks.already_in_game);

	// The properties zod can't constrain, since they depend on the engine's capabilities.
	// Unreachable via the client (it validates first), so reaching here is a hand-crafted message.
	if (
		body.strengthLevel > engineregistry.REGISTRY[ONLINE_ENGINE].maxStrengthLevel ||
		(body.variant.kind === 'preset' && !apeironcard.SUPPORTED_VARIANTS.has(body.variant.code))
	) {
		logEvents.addAndPrint('Player tried to create an engine game with invalid properties!', 'errLog'); // prettier-ignore
		return;
	}

	try {
		// Invalid variant; error already sent to the client.
		if (!createSeek.validateVariant(ws, body.variant, true)) return;

		// Delete their existing seeks
		activeSeeks.deleteOfUser(ws.metadata.memberInfo);

		const humanColor = body.color ?? (Math.random() < 0.5 ? players.WHITE : players.BLACK);
		const engineColor = typeutil.invertPlayer(humanColor);
		gameManager.createGame(
			{
				variant: body.variant,
				time: body.time,
				rated: false,
				private: false,
				engineParticipant: {
					color: engineColor,
					engine: ONLINE_ENGINE,
					version: manifest.getEngineVersion(),
					strengthLevel: body.strengthLevel,
				},
			},
			{ [humanColor]: { identifier: ws.metadata.memberInfo, socket: ws } },
		);

		// Unsubscribe them from the lobby.
		lobbySubscribers.remove(ws);
		lobbyManager.broadcastViewerCount(); // Notify the remaining lobby subscribers of the decremented viewer count
	} catch (error: unknown) {
		gameManager.onGameCreationError(error, [ws]);
	}
}

// Exports ---------------------------------------------------------------------

export default {
	create,
};
