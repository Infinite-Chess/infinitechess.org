// src/server/api/NewsAPI.ts

/**
 * API endpoints for news-related functionality.
 */

import type { Request, Response } from 'express';

import newsUtil from '../utility/newsUtil.js';
import { getMemberDataByCriteria, updateMemberColumns } from '../database/memberManager.js';

/** `GET /api/news/unread-count` — returns `{ count }` of the signed-in user's unread news posts. */
function getUnreadNewsCount(req: Request, res: Response): void {
	// Check if user is authenticated
	if (!req.memberInfo?.signedIn) {
		// Not logged in - return 0 unread
		res.json({ count: 0 });
		return;
	}

	const userId = req.memberInfo.user_id;

	try {
		// Get user's last read news date
		const record = getMemberDataByCriteria(['last_read_news_date'], 'user_id', userId);

		if (!record?.last_read_news_date) {
			// For some reason the cell was null or record not found
			res.json({ count: 0 });
			return;
		}

		// Count unread news posts
		res.json({ count: newsUtil.countUnreadNews(record.last_read_news_date) });
	} catch {
		// DB error (already logged)
		res.sendStatus(500);
	}
}

/** `GET /api/news/unread-dates` — returns `{ dates }`, the signed-in user's unread news dates (YYYY-MM-DD). */
function getUnreadNewsDatesEndpoint(req: Request, res: Response): void {
	if (!req.memberInfo?.signedIn) {
		// Not logged in - no unread news
		res.json({ dates: [] });
		return;
	}

	const userId = req.memberInfo.user_id;

	try {
		// Get user's last read news date
		const record = getMemberDataByCriteria(['last_read_news_date'], 'user_id', userId);

		if (!record?.last_read_news_date) {
			// For some reason the cell was null or undefined
			res.json({ dates: [] });
			return;
		}

		// Get unread news dates
		res.json({ dates: newsUtil.getUnreadNewsDates(record.last_read_news_date) });
	} catch {
		// DB error (already logged)
		res.sendStatus(500);
	}
}

/** `PATCH /api/news/read` — marks news read up to the latest post for the signed-in user. */
function markNewsAsRead(req: Request, res: Response): void {
	if (!req.memberInfo || !req.memberInfo.signedIn) {
		// Not logged in - nothing to update
		res.sendStatus(200);
		return;
	}

	const userId = req.memberInfo.user_id;

	const latestNewsDate = newsUtil.getLatestNewsDate();

	try {
		updateMemberColumns(userId, { last_read_news_date: latestNewsDate });
		res.sendStatus(200);
	} catch {
		// DB error (already logged)
		res.status(500).json({ message: `Server error updating last read news date` });
	}
}

export { getUnreadNewsCount, getUnreadNewsDatesEndpoint, markNewsAsRead };
