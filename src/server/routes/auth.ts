// src/server/routes/auth.ts

/**
 * Router for authentication & session endpoints: login, logout, and access-token issuance.
 * Mounted at /api so the routes keep their established top-level URLs.
 *
 * Mixed auth: login is public; logout and access-token need resolveAuth to read the caller's
 * session, so resolveAuth is applied per-route rather than across the whole router.
 */

import express from 'express';

import { resolveAuth } from '../middleware/resolveAuth.js';
import { handleLogin } from '../controllers/loginController.js';
import { handleLogout } from '../controllers/logoutController.js';
import { accessTokenIssuer } from '../controllers/authenticationTokens/accessTokenIssuer.js';
import { loginAttemptLimiter } from '../middleware/rateLimiters.js';

const router = express.Router();

router.post('/auth', loginAttemptLimiter, handleLogin); // Login (public)
router.post('/logout', resolveAuth, handleLogout);
router.post('/access-token', resolveAuth, accessTokenIssuer);

export default router;
