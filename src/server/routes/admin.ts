// src/server/routes/admin.ts

/**
 * Router for admin-only endpoints: the admin console command runner.
 * Mounted at /api/admin. Requires authentication; the handler further enforces the admin role.
 */

import express from 'express';

import { resolveAuth } from '../middleware/resolveAuth.js';
import { processCommand } from '../api/AdminPanel.js';

const router = express.Router();

router.use(resolveAuth);

router.post('/command', processCommand);

export default router;
