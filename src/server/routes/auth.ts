// src/server/routes/auth.ts

/**
 * Router for authentication & session endpoints: login, logout, and access-token issuance.
 * Mounted at /api so the routes keep their established top-level URLs.
 *
 * Mixed auth: login and logout are public (logout reads the refresh cookie directly); only
 * access-token needs to read the caller's session, so it resolves auth on just that route.
 */

import express from 'express';

import { handleLogin } from '../controllers/loginController.js';
import { handleLogout } from '../controllers/logoutController.js';
import { accessTokenIssuer } from '../controllers/authenticationTokens/accessTokenIssuer.js';
import { resolveRefreshAuth } from '../middleware/resolveAuth.js';
import { authAttemptLimiter } from '../middleware/rateLimiters.js';

const router = express.Router();

router.post('/auth', authAttemptLimiter, handleLogin); // Login (public)
router.post('/logout', handleLogout);
// Auth via the refresh token ONLY, so an access token can't indefinitely renew itself.
router.post('/access-token', resolveRefreshAuth, accessTokenIssuer);

export default router;
