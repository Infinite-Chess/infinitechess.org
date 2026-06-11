// src/server/routes/auth.ts

/**
 * Router for authentication & session endpoints: login, logout, and access-token issuance.
 * Mounted at /api so the routes keep their established top-level URLs.
 *
 * Mixed auth: login and logout are public (logout reads the refresh cookie directly); only
 * access-token needs resolveAuth to read the caller's session, so it's applied to just that route.
 */

import express from 'express';

import { resolveAuth } from '../middleware/resolveAuth.js';
import { handleLogin } from '../controllers/loginController.js';
import { handleLogout } from '../controllers/logoutController.js';
import { accessTokenIssuer } from '../controllers/authenticationTokens/accessTokenIssuer.js';
import { loginAttemptLimiter } from '../middleware/rateLimiters.js';

const router = express.Router();

router.post('/auth', loginAttemptLimiter, handleLogin); // Login (public)
router.post('/logout', handleLogout);
router.post('/access-token', resolveAuth, accessTokenIssuer);

export default router;
