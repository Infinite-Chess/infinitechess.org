// src/server/routes/practiceProgress.ts

/**
 * Router for the practice-progress resource: a member's beaten checkmate-practice list.
 * Mounted at /api/checkmates-progress. The whole resource requires authentication.
 *
 * Note: reads aren't here — progress is delivered to the client as a cookie by the global
 * setPracticeProgressCookie middleware, so this router only owns the write (PUT).
 */

import express from 'express';

import { resolveAuth } from '../middleware/resolveAuth.js';
import { postCheckmateBeaten } from '../api/PracticeProgress.js';

const router = express.Router();

router.use(resolveAuth);

router.put('/', postCheckmateBeaten);

export default router;
