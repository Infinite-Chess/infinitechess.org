// src/server/game/seeksmanager/createenginegame.ts

/**
 * Handles engine-game creation through the normal live-game pipeline.
 */

import type { CustomWebSocket } from '../../socket/socketUtility.js';
import type { CreateEngineGameMessage } from '../../../shared/serverbound.js';

import apeiron_card from '../../../shared/chess/engines/apeiron_card.js';
import typeutil, { players } from '../../../shared/chess/util/typeutil.js';
import { engineDictionary, ValidEngine } from '../../../shared/chess/engine.js';

import { getEngineVersion } from '../../config/manifest.js';
import { sendSocketMessage } from '../../socket/sendSocketMessage.js';
import { logEventsAndPrint } from '../../middleware/logEvents.js';
import { isSocketInAnActiveGame } from '../gamemanager/activeplayers.js';
import { resolveAndValidateVariant } from './createseek.js';
import { createGame, onGameCreationError } from '../gamemanager/gamemanager.js';

// Constants ---------------------------------------------------------------------------

/** The engine used for online computer games. */
const ONLINE_ENGINE: ValidEngine = 'apeiron';

// Functions ---------------------------------------------------------------------------

/**
 * Creates an engine game from the owner's websocket message. On success, createGame's
 * 'ingame' push navigates the client; on failure, notifies the client with the reason.
 */
async function createEngineGame(ws: CustomWebSocket, body: CreateEngineGameMessage): Promise<void> {
	if (isSocketInAnActiveGame(ws))
		return sendSocketMessage(ws, 'general', 'notify', ws.t.responses.seeks.already_in_game);

	// The properties zod can't constrain, since they depend on the engine's capabilities.
	// Unreachable via the client (it validates first), so reaching here is a hand-crafted message.
	if (
		body.strengthLevel > engineDictionary[ONLINE_ENGINE].maxStrengthLevel ||
		(body.variant.kind === 'preset' && !apeiron_card.SUPPORTED_VARIANTS.has(body.variant.code))
	) {
		logEventsAndPrint('Player tried to create an engine game with invalid properties!', 'errLog'); // prettier-ignore
		return;
	}

	try {
		const variant = await resolveAndValidateVariant(ws, body.variant);
		if (variant === null) return; // Invalid variant; error already sent to the client.
		// Check this again, as we have since awaited a promise.
		if (isSocketInAnActiveGame(ws))
			return sendSocketMessage(ws, 'general', 'notify', ws.t.responses.seeks.already_in_game);

		const humanColor = body.color ?? (Math.random() < 0.5 ? players.WHITE : players.BLACK);
		const engineColor = typeutil.invertPlayer(humanColor);
		createGame(
			{
				variant,
				time: body.time,
				rated: false,
				engineParticipant: {
					color: engineColor,
					engine: ONLINE_ENGINE,
					version: getEngineVersion(),
					strengthLevel: body.strengthLevel,
				},
			},
			{ [humanColor]: { identifier: ws.metadata.memberInfo, socket: ws } },
		);
	} catch (error: unknown) {
		onGameCreationError(error, [ws]);
	}
}

export { createEngineGame };
