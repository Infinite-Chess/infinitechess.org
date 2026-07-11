// src/server/routes/engineGame.ts

/**
 * Router for the engine-game resource: games against an engine, played locally in the
 * owner's browser but recorded server-side. Mounted at /api/engine-game. Every route
 * resolves auth — guests participate too, identified by their browser id.
 */

import express from 'express';

import EngineGameAPI from '../api/EngineGameAPI.js';
import { resolveAuth } from '../middleware/resolveAuth.js';
import { engineGameCreateLimiter, engineGameSyncLimiter, gameStateLimiter } from '../middleware/rateLimiters.js'; // prettier-ignore

const router = express.Router();

router.use(resolveAuth);

router.post('/', engineGameCreateLimiter, EngineGameAPI.postCreateEngineGame);
router.get('/:id', gameStateLimiter, EngineGameAPI.getEngineGameState);
router.post('/:id/progress', engineGameSyncLimiter, EngineGameAPI.postEngineGameProgress);
router.post('/:id/conclude', engineGameSyncLimiter, EngineGameAPI.postEngineGameConclusion);

export default router;
