// src/server/game/seeksmanager/createenginegame.ts

/**
 * Handles the `createengine` lobby action: starting a game against the server's
 * engine at once, with no seek posted and no opponent to wait for.
 *
 * Bypasses the lobby, but shares `createseek.ts`'s variant validation and
 * `gamemanager.ts`'s creation pipeline — an engine game is a live game like any other.
 */

import type { CustomWebSocket } from '../../socket/socketTypes.js';
import type { CreateEngineGameMessage } from '../../../shared/transport/serverbound.js';

import apeironcard from '../../../shared/chess/engines/apeironcard.js';
import typeutil, { players } from '../../../shared/util/typeutil.js';
import { ENGINE_DICTIONARY, ValidEngine } from '../../../shared/chess/util/engine.js';

import manifest from '../../config/manifest.js';
import logEvents from '../../utility/logEvents.js';
import createseek from './createseek.js';
import socketsend from '../../socket/socketSend.js';
import gamemanager from '../gamemanager/gamemanager.js';
import activeseeks from './activeseeks.js';
import lobbymanager from './lobbymanager.js';
import activeplayers from '../gamemanager/activeplayers.js';
import lobbysubscribers from './lobbysubscribers.js';

// Constants -------------------------------------------------------------------------------------

/** The engine used for online computer games. */
const ONLINE_ENGINE: ValidEngine = 'apeiron';

// Functions -------------------------------------------------------------------------------------

/**
 * Creates an engine game from the owner's websocket message. On success, createGame's
 * 'ingame' push navigates the client; on failure, notifies the client with the reason.
 */
function create(ws: CustomWebSocket, body: CreateEngineGameMessage): void {
	if (activeplayers.hasSocket(ws))
		return socketsend.send(ws, 'general', 'notify', ws.t.responses.seeks.already_in_game);

	// The properties zod can't constrain, since they depend on the engine's capabilities.
	// Unreachable via the client (it validates first), so reaching here is a hand-crafted message.
	if (
		body.strengthLevel > ENGINE_DICTIONARY[ONLINE_ENGINE].maxStrengthLevel ||
		(body.variant.kind === 'preset' && !apeironcard.SUPPORTED_VARIANTS.has(body.variant.code))
	) {
		logEvents.addAndPrint('Player tried to create an engine game with invalid properties!', 'errLog'); // prettier-ignore
		return;
	}

	try {
		// Invalid variant; error already sent to the client.
		if (!createseek.validateVariant(ws, body.variant, true)) return;

		// Delete their existing seeks
		activeseeks.deleteOfUser(ws.metadata.memberInfo);

		const humanColor = body.color ?? (Math.random() < 0.5 ? players.WHITE : players.BLACK);
		const engineColor = typeutil.invertPlayer(humanColor);
		gamemanager.createGame(
			{
				variant: body.variant,
				time: body.time,
				rated: false,
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
		lobbysubscribers.remove(ws);
		lobbymanager.broadcastViewerCount(); // Notify the remaining lobby subscribers of the decremented viewer count
	} catch (error: unknown) {
		gamemanager.onGameCreationError(error, [ws]);
	}
}

// Exports ---------------------------------------------------------------------------------------

export default {
	create,
};
