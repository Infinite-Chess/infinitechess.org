// src/server/routes/api.ts

/**
 * Aggregates every /api/* sub-router and one-off endpoint into a single apiRouter.
 * Mounted at /api in app.ts (which is the only place the /api prefix lives).
 * Each sub-router declares its own auth model; the one-off endpoints below don't
 * form resource families of their own.
 */

import type { Request, Response } from 'express';

import express from 'express';

import gameAPI from '../api/gameAPI.js';
import authRouter from './auth.js';
import newsRouter from './news.js';
import adminRouter from './admin.js';
import contributors from '../api/contributors.js';
import rateLimiters from '../middleware/rateLimiters.js';
import membersRouter from './members.js';
import registerRouter from './register.js';
import passwordRouter from './password.js';
import seekPreviewAPI from '../api/seekPreviewAPI.js';
import deployController from '../controllers/deployController.js';
import editorSavesRouter from './editorSaves.js';
import preferencesRouter from './preferences.js';
import leaderboardsRouter from './leaderboards.js';
import practiceProgressRouter from './practiceProgress.js';
import verifyAccountController from '../controllers/verifyAccountController.js';

const router = express.Router();

// Account router (public — no resolveAuth, these are pre-login)
router.use('/register', registerRouter);

// Member router
router.use('/members', membersRouter);

// Password-reset router (public, pre-login)
router.use('/', passwordRouter);

// One-off endpoints that don't form resource families ----------------------------------------

/** `GET /api/contributors` — returns the JSON list of project contributors. */
router.get('/contributors', (_req: Request, res: Response) => {
	res.json(contributors.get());
});

router.get('/seek-preview/:seekId', rateLimiters.seekPreview, seekPreviewAPI.get);

router.get('/game/:id', rateLimiters.gameState, gameAPI.getState);

// Endpoint called by the GitHub Actions deploy workflow before pm2 reload
router.post('/prepare-restart', deployController.handlePrepareRestart);

router.post('/verify/:token', verifyAccountController.verifyPendingRegistration);

// Routers that manage their own authentication (per-router or per-route resolveAuth) ---------

router.use('/', authRouter); // login + logout (both public)
router.use('/editor-saves', editorSavesRouter);
router.use('/news', newsRouter);
router.use('/preferences', preferencesRouter);
router.use('/checkmates-progress', practiceProgressRouter);
router.use('/admin', adminRouter);
router.use('/leaderboards', leaderboardsRouter);

export default router;
