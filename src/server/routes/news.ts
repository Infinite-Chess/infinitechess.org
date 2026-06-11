// src/server/routes/news.ts

/**
 * Router for the news resource: a member's read/unread state for news posts.
 * Mounted at /api/news. The whole resource requires authentication.
 */

import express from 'express';

import { resolveAuth } from '../middleware/resolveAuth.js';
import { getUnreadNewsCount, getUnreadNewsDatesEndpoint, markNewsAsRead } from '../api/NewsAPI.js';

const router = express.Router();

// Every news route reads the signed-in member's state, so auth is required.
router.use(resolveAuth);

router.get('/unread-count', getUnreadNewsCount);
router.get('/unread-dates', getUnreadNewsDatesEndpoint);
router.patch('/read', markNewsAsRead);

export default router;
