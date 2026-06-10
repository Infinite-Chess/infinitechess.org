// src/server/routes/register.ts

/**
 * Router for the register resource: account creation and the pending-registration flow.
 * Mounted at /api/register. Public — no authentication (these are pre-login).
 */

import express from 'express';

import {
	checkUsernameAvailable,
	createNewMember,
	pollPendingRegistration,
	changePendingEmail,
} from '../controllers/createAccountController.js';
import {
	createAccountLimiter,
	createAccountAttemptLimiter,
	verificationEmailLimiter,
	usernameAvailabilityLimiter,
} from '../middleware/rateLimiters.js';

const router = express.Router();

router.get('/availability', usernameAvailabilityLimiter, checkUsernameAvailable); // Currently ONLY can check username
router.post('/', createAccountAttemptLimiter, createAccountLimiter, createNewMember);
router.get('/awaiting/status', pollPendingRegistration);
router.put('/awaiting/email', verificationEmailLimiter, changePendingEmail);

export default router;
