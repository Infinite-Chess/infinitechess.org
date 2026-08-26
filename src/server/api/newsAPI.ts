// src/server/api/newsAPI.ts

/**
 * API endpoints for news-related functionality.
 */

import type { Request, Response } from 'express';

import newsUtil from '../utility/newsUtil.js';
import memberManager from '../database/memberManager.js';

// Functions --------------------------------------------------------------------------------------

/** `GET /api/news/unread-count` — returns `{ count }` of the signed-in user's unread news posts. */
function getUnreadCount(req: Request, res: Response): void {
	// Not logged in - return 0 unread
	if (!req.memberInfo?.signedIn) {
		res.json({ count: 0 });
		return;
	}

	try {
		const record = memberManager.getDataByCriteria(
			['last_read_news_date'],
			'user_id',
			req.memberInfo.user_id,
		);

		// Cell null or record not found - nothing read to compare against
		if (!record?.last_read_news_date) {
			res.json({ count: 0 });
			return;
		}

		res.json({ count: newsUtil.countUnreadNews(record.last_read_news_date) });
	} catch {
		// DB error (already logged)
		res.sendStatus(500);
	}
}

/** `GET /api/news/unread-dates` — returns `{ dates }`, the signed-in user's unread news dates (YYYY-MM-DD). */
function getUnreadDates(req: Request, res: Response): void {
	// Not logged in - no unread news
	if (!req.memberInfo?.signedIn) {
		res.json({ dates: [] });
		return;
	}

	try {
		const record = memberManager.getDataByCriteria(
			['last_read_news_date'],
			'user_id',
			req.memberInfo.user_id,
		);

		// Cell null or record not found - nothing read to compare against
		if (!record?.last_read_news_date) {
			res.json({ dates: [] });
			return;
		}

		res.json({ dates: newsUtil.getUnreadNewsDates(record.last_read_news_date) });
	} catch {
		// DB error (already logged)
		res.sendStatus(500);
	}
}

/** `PATCH /api/news/read` — marks news read up to the latest post for the signed-in user. */
function markAsRead(req: Request, res: Response): void {
	// Not logged in - nothing to update
	if (!req.memberInfo?.signedIn) {
		res.sendStatus(200);
		return;
	}

	const latestNewsDate = newsUtil.getLatestNewsDate();

	try {
		memberManager.updateColumns(req.memberInfo.user_id, {
			last_read_news_date: latestNewsDate,
		});
		res.sendStatus(200);
	} catch {
		// DB error (already logged)
		res.status(500).json({ message: `Server error updating last read news date` });
	}
}

// Exports ------------------------------------------------------------------------------------

export default { getUnreadCount, getUnreadDates, markAsRead };
