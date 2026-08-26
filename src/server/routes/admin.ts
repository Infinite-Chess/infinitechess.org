// src/server/routes/admin.ts

/**
 * Router for admin-only endpoints: the admin console command runner.
 * Mounted at /api/admin. Requires authentication; the handler further enforces the admin role.
 */

import express from 'express';

import adminPanel from '../api/adminPanel.js';
import resolveAuth from '../middleware/resolveAuth.js';

const router = express.Router();

router.use(resolveAuth.resolve);

router.post('/command', adminPanel.processCommand);

export default router;
