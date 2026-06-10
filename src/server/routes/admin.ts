// src/server/routes/admin.ts

/**
 * Router for admin-only endpoints: the admin console command runner.
 * Mounted at /api/admin. Requires authentication; the handler further enforces the admin role.
 */

import express from 'express';

import { verifyJWT } from '../middleware/verifyJWT.js';
import { processCommand } from '../api/AdminPanel.js';

const router = express.Router();

router.use(verifyJWT);

router.post('/command', processCommand);

export default router;
