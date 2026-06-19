// src/server/routes/auth.ts

/**
 * Router for authentication & session endpoints: login and logout.
 * Mounted at /api so the routes keep their established top-level URLs.
 *
 * Both are public: login issues the session, logout reads the refresh cookie directly to revoke it.
 */

import express from 'express';

import { handleLogin } from '../controllers/loginController.js';
import { handleLogout } from '../controllers/logoutController.js';
import { authAttemptLimiter } from '../middleware/rateLimiters.js';

const router = express.Router();

router.post('/auth', authAttemptLimiter, handleLogin);
router.post('/logout', handleLogout);

export default router;
