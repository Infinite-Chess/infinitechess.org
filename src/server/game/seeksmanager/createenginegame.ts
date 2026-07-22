// src/server/game/seeksmanager/createenginegame.ts

/**
 * Handles engine (vs computer) game creation over the websocket. Requiring an open socket
 * gates bots that would otherwise spam the old HTTP create endpoint before ever connecting.
 * Also enforces a per-identity creation cooldown and rolling-24h cap on top of that.
 */

import type { CreateEngineGameBody } from '../../../shared/types.js';
import type { CustomWebSocket } from '../../socket/socketUtility.js';

import clockutil from '../../../shared/chess/util/clockutil.js';
import { engineDictionary } from '../../../shared/chess/engine.js';

import { sendSocketMessage } from '../../socket/sendSocketMessage.js';
import { resolveAndValidateVariant } from './createseek.js';
import { issueUniqueGameId } from '../gamemanager/gamemanager.js';
import { createEngineGame } from '../gamemanager/enginegames.js';
import { logEventsAndPrint } from '../../middleware/logEvents.js';
import { getEngineGameCreationStats } from '../../database/engineGamesManager.js';

// Constants ---------------------------------------------------------------------------

/** Minimum time between engine-game creations per identity. */
const CREATE_COOLDOWN_MILLIS = 10_000;
/** Max engine games an identity may create per rolling 24 hours. */
const CREATE_DAILY_CAP = 200;
const DAY_MILLIS = 1000 * 60 * 60 * 24;

// Functions ---------------------------------------------------------------------------

/**
 * Creates an engine game from the owner's websocket message. On success, pushes the new
 * game id back so the client navigates; on failure, notifies the client with the reason.
 */
async function createEngineGameWs(ws: CustomWebSocket, body: CreateEngineGameBody): Promise<void> {
	const memberInfo = ws.metadata.memberInfo;
	// The owner must be identifiable to resume/conclude the game later.
	if (!memberInfo.signedIn && memberInfo.browser_id === undefined) {
		return sendSocketMessage(ws, 'general', 'notifyerror', ws.t.responses.errors.server_error);
	}

	// These are unreachable via the client (it validates first), so a hand-crafted message.
	if (!clockutil.isTimedControlValid(body.timeControl)) return;
	if (body.strengthLevel > engineDictionary[body.engine].maxStrengthLevel) return;

	const owner = {
		user_id: memberInfo.signedIn ? memberInfo.user_id : null,
		browser_id: memberInfo.browser_id ?? '',
	};

	try {
		// Rate limits (inert under vitest, mirroring the express limiters).
		if (process.env['NODE_ENV'] !== 'test') {
			const now = Date.now();
			const stats = getEngineGameCreationStats(owner, now - DAY_MILLIS);
			if (
				(stats.latest !== null && now - stats.latest < CREATE_COOLDOWN_MILLIS) ||
				stats.count >= CREATE_DAILY_CAP
			) {
				return sendSocketMessage(ws, 'general', 'notify', ws.t.responses.rate_limiting.generic);
			}
		}

		const variant = await resolveAndValidateVariant(ws, body.variant);
		if (variant === null) return; // Invalid variant; error already sent to the client.

		const id = issueUniqueGameId();
		createEngineGame(id, memberInfo, {
			variant,
			timeControl: body.timeControl,
			color: body.color,
			engine: body.engine,
			strengthLevel: body.strengthLevel,
		});

		// Tell the client to navigate to its new game (base62-encoded in the URL).
		sendSocketMessage(ws, 'lobby', 'enginegame', id);
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(`Error creating engine game: ${message}`, 'errLog');
		sendSocketMessage(ws, 'general', 'notifyerror', ws.t.responses.errors.server_error);
	}
}

export { createEngineGameWs };
