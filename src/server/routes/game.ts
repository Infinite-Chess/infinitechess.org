// src/server/routes/game.ts

/**
 * Router for the game resource: a concluded game's state, and reporting its chat.
 * Mounted at /api/game.
 *
 * The GET is public and must stay that way, so resolveAuth.resolve runs per-route on the
 * report alone, which needs the user_id of a member or the browser_id of a guest.
 */

import express from 'express';

import gameAPI from '../api/gameAPI.js';
import resolveAuth from '../middleware/resolveAuth.js';
import rateLimiters from '../middleware/rateLimiters.js';
import chatReportAPI from '../api/chatReportAPI.js';

const router = express.Router();

router.get('/:id', rateLimiters.gameState, gameAPI.getState);

router.post('/:id/chat-report', rateLimiters.chatReport, resolveAuth.resolve, chatReportAPI.submitReport); // prettier-ignore

export default router;
