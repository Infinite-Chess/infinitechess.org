// src/server/routes/leaderboards.ts

/**
 * Router for the leaderboards resource: ranked player listings.
 * Mounted at /api/leaderboards.
 *
 * Public to read, but resolveAuth.resolve runs per-route to populate the optional requester identity
 * (so a signed-in caller can also receive their own rank). resolveAuth.resolve doesn't reject anon callers.
 */

import express from 'express';

import resolveAuth from '../middleware/resolveAuth.js';
import leaderboardAPI from '../api/leaderboardAPI.js';

const router = express.Router();

router.get('/:leaderboard_id/top', resolveAuth.resolve, leaderboardAPI.getData);

export default router;
