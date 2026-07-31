// src/server/game/seeksmanager/createenginegame.ts

/** Handles engine-game creation through the normal live-game pipeline. */

import type { CreateEngineGameBody } from '../../../shared/types.js';
import type { CustomWebSocket } from '../../socket/socketUtility.js';

import { engineDictionary, ONLINE_ENGINE } from '../../../shared/chess/engine.js';
import { players } from '../../../shared/chess/util/typeutil.js';

import { sendSocketMessage } from '../../socket/sendSocketMessage.js';
import { resolveAndValidateVariant } from './createseek.js';
import { createGame } from '../gamemanager/gamemanager.js';
import { isSocketInAnActiveGame } from '../gamemanager/activeplayers.js';
import { logEventsAndPrint } from '../../middleware/logEvents.js';
import { getEngineVersion } from '../../config/manifest.js';

// Functions ---------------------------------------------------------------------------

/**
 * Creates an engine game from the owner's websocket message. On success, pushes the new
 * game id back so the client navigates; on failure, notifies the client with the reason.
 */
async function createEngineGameWs(ws: CustomWebSocket, body: CreateEngineGameBody): Promise<void> {
	if (isSocketInAnActiveGame(ws))
		return sendSocketMessage(ws, 'general', 'notify', ws.t.responses.seeks.already_in_game);

	const memberInfo = ws.metadata.memberInfo;
	// These are unreachable via the client (it validates first), so a hand-crafted message.
	if (body.strengthLevel > engineDictionary[ONLINE_ENGINE].maxStrengthLevel) return;

	try {
		const variant = await resolveAndValidateVariant(ws, body.variant);
		if (variant === null) return; // Invalid variant; error already sent to the client.
		if (isSocketInAnActiveGame(ws))
			return sendSocketMessage(ws, 'general', 'notify', ws.t.responses.seeks.already_in_game);

		const humanColor = body.color ?? (Math.random() < 0.5 ? players.WHITE : players.BLACK);
		const engineColor = humanColor === players.WHITE ? players.BLACK : players.WHITE;
		const id = createGame(
			{
				variant,
				time: body.timeControl,
				rated: false,
				engineParticipant: {
					color: engineColor,
					engine: ONLINE_ENGINE,
					version: getEngineVersion(),
					strengthLevel: body.strengthLevel,
				},
			},
			{
				[humanColor]: { identifier: memberInfo, socket: ws },
			},
		);

		// Tell the client to navigate to its new game (base62-encoded in the URL).
		sendSocketMessage(ws, 'lobby', 'enginegame', id);
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(`Error creating engine game: ${message}`, 'errLog');
		sendSocketMessage(ws, 'general', 'notifyerror', ws.t.responses.errors.server_error);
	}
}

export { createEngineGameWs };
