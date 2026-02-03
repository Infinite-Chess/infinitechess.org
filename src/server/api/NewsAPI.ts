// src/server/api/NewsAPI.ts

/**
 * API endpoints for news-related functionality.
 */

import type { Request, Response } from 'express';

import { getMemberDataByCriteria, updateMemberColumns } from '../database/memberManager.js';
import { countUnreadNews, getLatestNewsDate, getUnreadNewsDates } from '../utility/newsUtil.js';
import { logEventsAndPrint } from '../middleware/logEvents.js';

/**
 * API endpoint to get the count of unread news posts for the current user.
 * Returns { count: number } or { count: 0 } if not logged in.
 */
function getUnreadNewsCount(req: Request, res: Response): void {
	// Check if user is authenticated
	if (!req.memberInfo?.signedIn) {
		// Not logged in - return 0 unread
		res.json({ count: 0 });
		return;
	}

	const userId = req.memberInfo.user_id;

	// Get user's last read news date
	const record = getMemberDataByCriteria(['last_read_news_date'], 'user_id', userId);

	if (!record?.last_read_news_date) {
		// For some reason the cell was null or record not found
		res.json({ count: 0 });
		return;
	}

	// Count unread news posts
	const unreadCount = countUnreadNews(record.last_read_news_date);

	res.json({ count: unreadCount });
}

/**
 * Gets the list of unread news dates for the current user.
 * Returns { dates: string[] } with dates in YYYY-MM-DD format.
 */
function getUnreadNewsDatesEndpoint(req: Request, res: Response): void {
	if (!req.memberInfo?.signedIn) {
		// Not logged in - no unread news
		res.json({ dates: [] });
		return;
	}

	const userId = req.memberInfo.user_id;

	// Get user's last read news date
	const record = getMemberDataByCriteria(['last_read_news_date'], 'user_id', userId);

	if (!record?.last_read_news_date) {
		// For some reason the cell was null or undefined
		res.json({ dates: [] });
		return;
	}

	// Get unread news dates
	const unreadDates = getUnreadNewsDates(record.last_read_news_date);

	res.json({ dates: unreadDates });
}

/**
 * Updates the user's last read news date to the current latest news post.
 * This should be called when the user visits the news page.
 */
function markNewsAsRead(req: Request, res: Response): void {
	if (!req.memberInfo || !req.memberInfo.signedIn) {
		// Not logged in - nothing to update
		res.status(200).json({ success: true });
		return;
	}

	const userId = req.memberInfo.user_id;

	const latestNewsDate = getLatestNewsDate();

	try {
		const result = updateMemberColumns(userId, { last_read_news_date: latestNewsDate });

		if (result.changeMade) {
			res.status(200).json({ success: true });
		} else {
			logEventsAndPrint(
				`Failed to update last read news date for member of ID "${userId}". No changes made. Do they exist?`,
				'errLog.txt',
			);
			res.status(500).json({
				success: false,
				message: 'Failed to update last read news date.',
			});
		}
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(
			`Error updating last read news date for member of ID "${userId}": ${message}`,
			'errLog.txt',
		);
		res.status(500).json({
			success: false,
			message: `Server error updating last read news date`,
		});
	}
}

export { getUnreadNewsCount, getUnreadNewsDatesEndpoint, markNewsAsRead };
