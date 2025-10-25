// src/server/api/NewsAPI.ts

/**
 * API endpoints for news-related functionality.
 */

import { IdentifiedRequest } from '../types.js';
import { Response } from 'express';
// @ts-ignore - No type definitions available
import { getMemberDataByCriteria, updateLastReadNewsDate } from '../database/memberManager.js';
import { countUnreadNews, getLatestNewsDate, getUnreadNewsDates } from '../utility/newsUtil.js';
// @ts-ignore - No type definitions available
import { getLanguageToServe } from '../utility/translate.js';

/**
 * API endpoint to get the count of unread news posts for the current user.
 * Returns { count: number } or { count: 0 } if not logged in.
 */
function getUnreadNewsCount(req: IdentifiedRequest, res: Response): void {
	// Check if user is authenticated
	if (!req.memberInfo || !req.memberInfo.signedIn) {
		// Not logged in - return 0 unread
		res.json({ count: 0 });
		return;
	}

	const userId = req.memberInfo.user_id;

	try {
		// Get user's last read news date
		const memberData = getMemberDataByCriteria(['last_read_news_date'], 'user_id', userId);
		
		if (!memberData) {
			res.json({ count: 0 });
			return;
		}

		const lastReadDate = (memberData as any).last_read_news_date as string | null;
		
		// Get the user's language preference
		const language = getLanguageToServe(req);
		
		// Count unread news posts
		const unreadCount = countUnreadNews(lastReadDate, language);
		
		res.json({ count: unreadCount });
	} catch (error) {
		console.error('Error getting unread news count:', error);
		res.status(500).json({ count: 0 });
	}
}

/**
 * Gets the list of unread news dates for the current user.
 * Returns { dates: string[] } with dates in YYYY-MM-DD format.
 */
function getUnreadNewsDatesEndpoint(req: IdentifiedRequest, res: Response): void {
	// Get the user's language preference
	const language = getLanguageToServe(req);
	
	if (!req.memberInfo || !req.memberInfo.signedIn) {
		// Not logged in - no unread news
		res.json({ dates: [] });
		return;
	}

	const userId = req.memberInfo.user_id;

	try {
		// Get user's last read news date
		const memberData = getMemberDataByCriteria(['last_read_news_date'], 'user_id', userId);
		
		if (!memberData) {
			res.json({ dates: [] });
			return;
		}

		const lastReadDate = (memberData as any).last_read_news_date as string | null;
		
		// Get unread news dates
		const unreadDates = getUnreadNewsDates(lastReadDate, language);
		
		res.json({ dates: unreadDates });
	} catch (error) {
		console.error('Error getting unread news dates:', error);
		res.status(500).json({ dates: [] });
	}
}

/**
 * Updates the user's last read news date to the current latest news post.
 * This should be called when the user visits the news page.
 */
function markNewsAsRead(req: IdentifiedRequest, res: Response): void {
	if (!req.memberInfo || !req.memberInfo.signedIn) {
		// Not logged in - nothing to update
		res.status(200).json({ success: true });
		return;
	}

	const userId = req.memberInfo.user_id;

	try {
		const language = getLanguageToServe(req);
		const latestNewsDate = getLatestNewsDate(language);
		
		if (latestNewsDate) {
			updateLastReadNewsDate(userId, latestNewsDate);
		}
		
		res.status(200).json({ success: true });
	} catch (error) {
		console.error('Error marking news as read:', error);
		res.status(500).json({ success: false, error: 'Internal server error' });
	}
}

export {
	getUnreadNewsCount,
	getUnreadNewsDatesEndpoint,
	markNewsAsRead,
};
