// src/server/routes/news.ts

/**
 * Router for the news resource: a member's read/unread state for news posts.
 * Mounted at /api/news. The whole resource requires authentication.
 */

import express from 'express';

import newsAPI from '../api/newsAPI.js';
import resolveAuth from '../middleware/resolveAuth.js';

const router = express.Router();

// Every news route reads the signed-in member's state, so auth is required.
router.use(resolveAuth.resolve);

router.get('/unread-count', newsAPI.getUnreadCount);
router.get('/unread-dates', newsAPI.getUnreadDates);
router.patch('/read', newsAPI.markAsRead);

export default router;
