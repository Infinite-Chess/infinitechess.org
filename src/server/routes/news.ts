// src/server/routes/news.ts

/**
 * Router for the news resource: a member's read/unread state for news posts.
 * Mounted at /api/news. The whole resource requires authentication.
 */

import express from 'express';

import NewsAPI from '../api/NewsAPI.js';
import resolveAuth from '../middleware/resolveAuth.js';

const router = express.Router();

// Every news route reads the signed-in member's state, so auth is required.
router.use(resolveAuth.resolve);

router.get('/unread-count', NewsAPI.getUnreadCount);
router.get('/unread-dates', NewsAPI.getUnreadDates);
router.patch('/read', NewsAPI.markAsRead);

export default router;
