// src/server/routes/register.ts

/**
 * Router for the register resource: account creation and the pending-registration flow.
 * Mounted at /api/register. Public — no authentication (these are pre-login).
 */

import express from 'express';

import rateLimiters from '../middleware/rateLimiters.js';
import {
	checkUsernameAvailable,
	createNewMember,
	pollPendingRegistration,
	changePendingEmail,
} from '../controllers/registerController.js';

const router = express.Router();

router.get('/availability', rateLimiters.usernameAvailability, checkUsernameAvailable); // Currently ONLY can check username
router.post('/', rateLimiters.createAccountAttempt, rateLimiters.createAccount, createNewMember);
router.get('/awaiting/status', pollPendingRegistration);
router.put('/awaiting/email', rateLimiters.verificationEmail, changePendingEmail);

export default router;
