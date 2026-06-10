// src/server/routes/leaderboards.ts

/**
 * Router for the leaderboards resource: ranked player listings.
 * Mounted at /api/leaderboards.
 *
 * Public to read, but verifyJWT runs per-route to populate the optional requester identity
 * (so a signed-in caller can also receive their own rank). verifyJWT doesn't reject anon callers.
 */

import express from 'express';

import { verifyJWT } from '../middleware/verifyJWT.js';
import { getLeaderboardData } from '../api/LeaderboardAPI.js';

const router = express.Router();

router.get('/:leaderboard_id/top', verifyJWT, getLeaderboardData);

export default router;
