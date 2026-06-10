// src/server/routes/auth.ts

/**
 * Router for authentication & session endpoints: login, logout, and access-token issuance.
 * Mounted at /api so the routes keep their established top-level URLs.
 *
 * Mixed auth: login is public; logout and access-token need verifyJWT to read the caller's
 * session, so verifyJWT is applied per-route rather than across the whole router.
 */

import express from 'express';

import { verifyJWT } from '../middleware/verifyJWT.js';
import { handleLogin } from '../controllers/loginController.js';
import { handleLogout } from '../controllers/logoutController.js';
import { accessTokenIssuer } from '../controllers/authenticationTokens/accessTokenIssuer.js';
import { loginAttemptLimiter } from '../middleware/rateLimiters.js';

const router = express.Router();

router.post('/auth', loginAttemptLimiter, handleLogin); // Login (public)
router.post('/logout', verifyJWT, handleLogout);
router.post('/access-token', verifyJWT, accessTokenIssuer);

export default router;
