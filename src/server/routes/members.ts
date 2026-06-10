// src/server/routes/members.ts

/**
 * Router for the members resource: account management.
 * Mounted at /api/members. Public — account deletion authenticates via the
 * password in the request body, not a JWT.
 */

import express from 'express';

import { removeAccount } from '../controllers/deleteAccountController.js';

const router = express.Router();

router.delete('/:member', removeAccount);

export default router;
