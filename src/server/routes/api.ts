// src/server/routes/api.ts

/**
 * Aggregates every /api/* sub-router and one-off endpoint into a single apiRouter.
 * Mounted at /api in middleware.ts (which is the only place the /api prefix lives).
 * Each sub-router declares its own auth model; the one-off endpoints below don't
 * form resource families of their own.
 */

import type { Request, Response } from 'express';

import express from 'express';

import authRouter from './auth.js';
import newsRouter from './news.js';
import adminRouter from './admin.js';
import membersRouter from './members.js';
import registerRouter from './register.js';
import passwordRouter from './password.js';
import editorSavesRouter from './editorSaves.js';
import preferencesRouter from './preferences.js';
import leaderboardsRouter from './leaderboards.js';
import { getSeekPreview } from '../api/SeekPreviewAPI.js';
import { getContributors } from '../api/GitHub.js';
import practiceProgressRouter from './practiceProgress.js';
import { seekPreviewLimiter } from '../middleware/rateLimiters.js';
import { handlePrepareRestart } from '../controllers/deployController.js';
import { verifyPendingRegistration } from '../controllers/verifyAccountController.js';

const router = express.Router();

// Account router (public — no resolveAuth, these are pre-login)
router.use('/register', registerRouter);

// Member router
router.use('/members', membersRouter);

// Password-reset router (public, pre-login)
router.use('/', passwordRouter);

// One-off endpoints that don't form resource families ----------------------------

router.put('/language', (req: Request, res: Response) => {
	// Language cookie setter
	res.cookie('i18next', req.i18n.resolvedLanguage);
	res.send(''); // Doesn't work without this for some reason
});

router.get('/contributors', (_req: Request, res: Response) => {
	const contributors = getContributors();
	res.send(JSON.stringify(contributors));
});

router.get('/seek-preview/:seekId', seekPreviewLimiter, getSeekPreview);

// Endpoint called by the GitHub Actions deploy workflow before pm2 reload
router.post('/prepare-restart', handlePrepareRestart);

router.post('/verify/:token', verifyPendingRegistration);

// Routers that manage their own authentication (per-router or per-route resolveAuth) -

router.use('/', authRouter); // login (public), logout + access-token (authed)
router.use('/editor-saves', editorSavesRouter);
router.use('/news', newsRouter);
router.use('/preferences', preferencesRouter);
router.use('/checkmates-progress', practiceProgressRouter);
router.use('/admin', adminRouter);
router.use('/leaderboards', leaderboardsRouter);

export default router;
