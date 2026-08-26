// src/server/routes/practiceProgress.ts

/**
 * Router for the practice-progress resource: a member's beaten checkmate-practice list.
 * Mounted at /api/checkmates-progress. The whole resource requires authentication.
 *
 * Note: reads aren't here — progress is delivered to the client as a cookie by the global
 * practiceProgressCookie.set middleware, so this router only owns the write (PUT).
 */

import express from 'express';

import resolveAuth from '../middleware/resolveAuth.js';
import practiceProgress from '../api/practiceProgress.js';

const router = express.Router();

router.use(resolveAuth.resolve);

router.put('/', practiceProgress.postCheckmateBeaten);

export default router;
