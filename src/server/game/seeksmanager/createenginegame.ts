// src/server/game/seeksmanager/createenginegame.ts

/** Handles engine-game creation through the normal live-game pipeline. */

import type { CustomWebSocket } from '../../socket/socketUtility.js';
import type { CreateEngineGameMessage } from '../../../shared/types.js';

import { players } from '../../../shared/chess/util/typeutil.js';
import apeiron_card from '../../../shared/chess/engines/apeiron_card.js';
import { engineDictionary, ONLINE_ENGINE } from '../../../shared/chess/engine.js';

import { createGame } from '../gamemanager/gamemanager.js';
import { getEngineVersion } from '../../config/manifest.js';
import { sendSocketMessage } from '../../socket/sendSocketMessage.js';
import { logEventsAndPrint } from '../../middleware/logEvents.js';
import { isSocketInAnActiveGame } from '../gamemanager/activeplayers.js';
import { resolveAndValidateVariant } from './createseek.js';

// Functions ---------------------------------------------------------------------------

/**
 * Creates an engine game from the owner's websocket message. On success, createGame's
 * 'ingame' push navigates the client; on failure, notifies the client with the reason.
 */
async function createEngineGameWs(
	ws: CustomWebSocket,
	body: CreateEngineGameMessage,
): Promise<void> {
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
		if (isSocketInAnActiveGame(ws))
			return sendSocketMessage(ws, 'general', 'notify', ws.t.responses.seeks.already_in_game);

		const humanColor = body.color ?? (Math.random() < 0.5 ? players.WHITE : players.BLACK);
		const engineColor = humanColor === players.WHITE ? players.BLACK : players.WHITE;
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
			{
				[humanColor]: { identifier: ws.metadata.memberInfo, socket: ws },
			},
		);
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(`Error creating engine game: ${message}`, 'errLog');
		sendSocketMessage(ws, 'general', 'notifyerror', ws.t.responses.errors.server_error);
	}
}

export { createEngineGameWs };
