// src/server/routes/password.ts

/**
 * Router for the password-reset flow: requesting a reset email and performing the reset.
 * Mounted at /api (the two URLs don't share a deeper prefix). Public — these are pre-login.
 */

import express from 'express';

import { forgotPasswordLimiter } from '../middleware/rateLimiters.js';
import {
	handleForgotPasswordRequest,
	handleResetPassword,
} from '../controllers/passwordResetController.js';

const router = express.Router();

router.post('/forgot-password', forgotPasswordLimiter, handleForgotPasswordRequest);
router.post('/reset-password', handleResetPassword);

export default router;
