// src/server/routes/password.ts

/**
 * Router for the password-reset flow: requesting a reset email and performing the reset.
 * Mounted at /api (the two URLs don't share a deeper prefix). Public — these are pre-login.
 */

import express from 'express';

import rateLimiters from '../middleware/rateLimiters.js';
import passwordResetController from '../controllers/passwordResetController.js';

const router = express.Router();

router.post(
	'/forgot-password',
	rateLimiters.forgotPassword,
	passwordResetController.handleForgotPasswordRequest,
);
router.post('/reset-password', passwordResetController.handleResetPassword);

export default router;
