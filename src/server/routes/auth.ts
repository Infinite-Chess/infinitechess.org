// src/server/routes/auth.ts

/**
 * Router for authentication & session endpoints: login and logout.
 * Mounted at /api so the routes keep their established top-level URLs.
 *
 * Both are public: login issues the session, logout reads the refresh cookie directly to revoke it.
 */

import express from 'express';

import rateLimiters from '../middleware/rateLimiters.js';
import loginController from '../controllers/loginController.js';
import logoutController from '../controllers/logoutController.js';

const router = express.Router();

router.post('/auth', rateLimiters.authAttempt, loginController.handleLogin);
router.post('/logout', logoutController.handleLogout);

export default router;
