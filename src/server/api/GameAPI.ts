// src/server/api/GameAPI.ts

/**
 * HTTP API handler for fetching a concluded ("dead") game's state.
 * Live games are delivered over the WebSocket instead (see the subscribe flow).
 */

import type { Request, Response } from 'express';

import gamesManager from '../database/gamesManager.js';
import deadgamestate from '../game/gamemanager/deadgamestate.js';

/**
 * `GET /api/game/:id` — returns the {@link DeadGameState} of a concluded game.
 * 404s if no such game exists, or if the game is still live (not in DB).
 */
function getGameState(req: Request, res: Response): void {
	const decoded = gamesManager.decodeID(req.params['id']!);
	if (decoded === undefined) {
		// Unlocalized because browsers visiting the /game/:id page are sent 404 before this.
		res.status(400).send('Invalid game ID format.');
		return;
	}

	const deadGameState = deadgamestate.produceGameState(decoded);
	if (deadGameState === undefined) {
		// Not a logged concluded game (still-live games aren't in the games table yet).
		// Unlocalized because clients will never be instructed to request a non-existent game
		res.status(404).send('Game not found.');
		return;
	}

	res.json(deadGameState);
}

export { getGameState };
