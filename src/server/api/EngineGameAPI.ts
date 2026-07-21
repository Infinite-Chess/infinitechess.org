// src/server/api/EngineGameAPI.ts

/**
 * API endpoints for engine (vs computer) games, played locally in the owner's
 * browser but recorded server-side with a real game id like PvP games:
 *
 * * `POST   /api/engine-game`              — create a game, returns its id.
 * * `GET    /api/engine-game/:id`          — the owner's resumable live-game state.
 * * `POST   /api/engine-game/:id/progress` — per-move state sync.
 * * `POST   /api/engine-game/:id/conclude` — log the finished game permanently.
 */

import type { Request, Response } from 'express';
import type { AuthSeekVariant } from '../../shared/types.js';
import type { EngineGamesRecord } from '../database/engineGamesManager.js';

import clockutil from '../../shared/chess/util/clockutil.js';
import { engineDictionary } from '../../shared/chess/engine.js';
import { POSITION_STRING_THRESHOLD } from '../../shared/chess/variants/servervalidation.js';
import compression, { CompressionMode } from '../../shared/util/compression.js';
import {
	CreateEngineGameBodySchema,
	ConcludeEngineGameBodySchema,
	EngineGameProgressBodySchema,
} from '../../shared/types.js';

import { logZodError } from '../utility/zodlogger.js';
import { decodeGameId } from '../database/gamesManager.js';
import { logEventsAndPrint } from '../middleware/logEvents.js';
import { issueUniqueGameId } from '../game/gamemanager/gamemanager.js';
import { getSavedPositionICN } from '../database/editorSavesManager.js';
import { validateIcnSeekContent } from '../game/seeksmanager/createseek.js';
import {
	createEngineGame,
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

/** `POST /api/engine-game` — creates an engine game, responding `{ id }`. */
async function postCreateEngineGame(req: Request, res: Response): Promise<void> {
	const memberInfo = req.memberInfo!;
	// The owner must be identifiable to resume/conclude the game later.
	if (!memberInfo.signedIn && memberInfo.browser_id === undefined) {
		res.status(403).json({ message: 'Cannot identify you. Are cookies enabled?' });
		return;
	}

	const parseResult = CreateEngineGameBodySchema.safeParse(req.body);
	if (!parseResult.success) {
		// Not localized: unreachable via the client, only a hand-crafted request lands here.
		res.status(400).json({ message: 'The request was invalid.' });
		logZodError(req.body, parseResult.error, 'Invalid create engine game request body.');
		return;
	}
	const body = parseResult.data;

	if (!clockutil.isTimedControlValid(body.timeControl)) {
		res.status(400).json({ message: 'Invalid clock value.' });
		return;
	}
	if (body.strengthLevel > engineDictionary[body.engine].maxStrengthLevel) {
		res.status(400).json({ message: 'Invalid engine strength level.' });
		return;
	}

	try {
		// Resolve cloudSave variants to plain ICN (mirrors seek creation).
		let variant: AuthSeekVariant;
		if (body.variant.kind === 'cloudSave') {
			if (!memberInfo.signedIn) {
				res.status(401).json({ message: req.t.responses.seeks.cloud_requires_sign_in });
				return;
			}
			const record = getSavedPositionICN(body.variant.name, memberInfo.user_id);
			if (record === undefined) {
				res.status(404).json({ message: req.t.responses.seeks.cloud_not_found });
				return;
			}
			// Skip decompression if the compressed payload is already too large to be legal.
			if (record.icn.length > POSITION_STRING_THRESHOLD) {
				res.status(400).json({ message: req.t.shared.position_errors.position_too_large });
				return;
			}
			const position = await compression.decompressString(
				record.icn,
				record.compression as CompressionMode,
			);
			variant = { kind: 'custom', position };
		} else {
			variant = body.variant;
		}

		// Validate a custom position's legality.
		if (variant.kind === 'custom') {
			const illegalReason = validateIcnSeekContent(variant.position);
			if (illegalReason !== null) {
				res.status(400).json({
					message: req.t.shared.position_errors[illegalReason] ?? illegalReason,
				});
				return;
			}
		}

		const id = issueUniqueGameId();
		createEngineGame(id, memberInfo, {
			variant,
			timeControl: body.timeControl,
			color: body.color,
			engine: body.engine,
			strengthLevel: body.strengthLevel,
		});
		res.status(201).json({ id });
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(`Error creating engine game: ${message}`, 'errLog');
		res.status(500).json({ message: 'A server error occurred. Please try again.' });
	}
}

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
function postEngineGameConclusion(req: Request, res: Response): void {
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

		const logged = concludeEngineGame(row, parseResult.data);
		res.json({ logged });
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(`Error concluding engine game ${req.params['id']}: ${message}`, 'errLog');
		res.status(500).json({ message: 'A server error occurred. Please try again.' });
	}
}

// Exports -----------------------------------------------------------------------------------

export default {
	postCreateEngineGame,
	getEngineGameState,
	postEngineGameProgress,
	postEngineGameConclusion,
};
