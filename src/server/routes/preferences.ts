// src/server/routes/preferences.ts

/**
 * Router for the preferences resource: a member's saved settings.
 * Mounted at /api/preferences. The whole resource requires authentication.
 *
 * Note: reads aren't here — preferences are delivered to the client as a cookie by the
 * global setPrefsCookie middleware, so this router only owns the write (PUT).
 */

import express from 'express';

import prefs from '../api/prefs.js';
import resolveAuth from '../middleware/resolveAuth.js';

const router = express.Router();

router.use(resolveAuth.resolve);

router.put('/', prefs.put);

export default router;
