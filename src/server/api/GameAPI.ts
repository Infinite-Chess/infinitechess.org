// src/server/api/GameAPI.ts

/**
 * HTTP API handler for fetching a concluded ("dead") game's state.
 * Live games are delivered over the WebSocket instead (see the subscribe flow).
 */

import type { Request, Response } from 'express';

import { decodeGameId } from '../database/gamesManager.js';
import { logEventsAndPrint } from '../middleware/logEvents.js';
import { produceDeadGameState } from '../game/gamemanager/deadgamestate.js';

/**
 * `GET /api/game/:id` — returns the {@link DeadGameState} of a concluded game.
 * 404s if no such game exists, or if the game is still live (not in DB).
 */
async function getGameState(req: Request, res: Response): Promise<void> {
	const decoded = decodeGameId(req.params['id']!);
	if (decoded === undefined) {
		// Unlocalized because browsers visiting the /game/:id page are sent 404 before this.
		res.status(400).send('Invalid game ID format.');
		return;
	}

	try {
		const deadGameState = await produceDeadGameState(decoded);
		if (deadGameState === undefined) {
			// Not a logged concluded game (still-live games aren't in the games table yet).
			// Unlocalized because clients will never be instructed to request a non-existent game
			res.status(404).send('Game not found.');
			return;
		}
		res.json(deadGameState);
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(`Error fetching dead game state: ${message}`, 'errLog');
		res.status(500).send('A server error occurred. Please try again.');
	}
}

export { getGameState };
