// src/server/api/EngineGameAPI.ts

/**
 * API endpoints for engine (vs computer) games, played locally in the owner's
 * browser but recorded server-side with a real game id like PvP games:
 *
 * * `GET    /api/engine-game/:id`          — the owner's resumable live-game state.
 * * `POST   /api/engine-game/:id/progress` — per-move state sync.
 * * `POST   /api/engine-game/:id/conclude` — log the finished game permanently.
 *
 * Creation happens over the websocket (see `createenginegame.ts`) so it requires an
 * open socket — a bot gate — rather than a bare HTTP POST.
 */

import type { Request, Response } from 'express';
import type { EngineGamesRecord } from '../database/engineGamesManager.js';

import { ConcludeEngineGameBodySchema, EngineGameProgressBodySchema } from '../../shared/types.js';

import { logZodError } from '../utility/zodlogger.js';
import { decodeGameId } from '../database/gamesManager.js';
import { logEventsAndPrint } from '../middleware/logEvents.js';
import {
	getLiveEngineGame,
	isEngineGameOwner,
	concludeEngineGame,
	recordEngineGameProgress,
	produceEngineGameResumeState,
} from '../game/gamemanager/enginegames.js';

// Helpers -----------------------------------------------------------------------------------

/**
 * Resolves the live engine game named by the URL and asserts the requester owns it.
 * Sends the appropriate error response and returns `undefined` on any failure.
 */
function resolveOwnedLiveEngineGame(req: Request, res: Response): EngineGamesRecord | undefined {
	const id = decodeGameId(req.params['id']!);
	if (id === undefined) {
		res.status(400).json({ message: 'Invalid game id.' });
		return undefined;
	}

	const row = getLiveEngineGame(id);
	if (row === undefined) {
		res.status(404).json({ message: 'No such live engine game.' });
		return undefined;
	}

	if (!isEngineGameOwner(row, req.memberInfo!)) {
		res.status(403).json({ message: 'You are not a participant of this engine game.' });
		return undefined;
	}

	return row;
}

// API Endpoints -----------------------------------------------------------------------------

/** `GET /api/engine-game/:id` — the owner's resumable state of a live engine game. */
function getEngineGameState(req: Request, res: Response): void {
	try {
		const row = resolveOwnedLiveEngineGame(req, res);
		if (row === undefined) return;
		res.json(produceEngineGameResumeState(row));
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(`Error fetching engine game state: ${message}`, 'errLog');
		res.status(500).json({ message: 'A server error occurred. Please try again.' });
	}
}

/** `POST /api/engine-game/:id/progress` — records the owner's per-move state sync. */
function postEngineGameProgress(req: Request, res: Response): void {
	try {
		const row = resolveOwnedLiveEngineGame(req, res);
		if (row === undefined) return;

		const parseResult = EngineGameProgressBodySchema.safeParse(req.body);
		if (!parseResult.success) {
			// Not localized: unreachable via the client, only a hand-crafted request lands here.
			res.status(400).json({ message: 'The request was invalid.' });
			logZodError(req.body, parseResult.error, 'Invalid engine game progress request body.');
			return;
		}

		recordEngineGameProgress(row.game_id, parseResult.data);
		res.status(204).end();
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(`Error recording engine game progress: ${message}`, 'errLog');
		res.status(500).json({ message: 'A server error occurred. Please try again.' });
	}
}

/** `POST /api/engine-game/:id/conclude` — logs the finished game to the permanent tables. */
async function postEngineGameConclusion(req: Request, res: Response): Promise<void> {
	try {
		const row = resolveOwnedLiveEngineGame(req, res);
		if (row === undefined) return;

		const parseResult = ConcludeEngineGameBodySchema.safeParse(req.body);
		if (!parseResult.success) {
			// Not localized: unreachable via the client, only a hand-crafted request lands here.
			res.status(400).json({ message: 'The request was invalid.' });
			logZodError(req.body, parseResult.error, 'Invalid engine game conclusion request body.'); // prettier-ignore
			return;
		}

		const logged = await concludeEngineGame(row, parseResult.data);
		res.json({ logged });
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(`Error concluding engine game ${req.params['id']}: ${message}`, 'errLog');
		res.status(500).json({ message: 'A server error occurred. Please try again.' });
	}
}

// Exports -----------------------------------------------------------------------------------

export default {
	getEngineGameState,
	postEngineGameProgress,
	postEngineGameConclusion,
};
