// src/server/utility/newsUtil.ts

/**
 * Utility functions for handling news posts and tracking read status.
 */

import fs from 'fs';
import path from 'path';

import tconfig from '../config/translationconfig.js';

/** The directory containing the news posts, which are files named like "2025-11-01.md". */
function getNewsDir(): string {
	return path.join(tconfig.NEWS_FOLDER, tconfig.DEFAULT_LANGUAGE);
}

/**
 * Gets all news post dates.
 * @returns Array of date strings sorted from oldest to newest
 */
function getAllNewsDates(): string[] {
	if (!fs.existsSync(getNewsDir())) return [];

	const files = fs.readdirSync(getNewsDir());
	const newsFiles = files.filter((file) => file.endsWith('.md'));

	// Extract dates and sort
	const dates = newsFiles.map((file) => file.replace('.md', '')).sort();
	return dates;
}

/**
 * Gets the date of the latest news post.
 * @returns The date string of the latest news post (e.g., '2025-11-01'), or null if no news posts exist
 */
function getLatestNewsDate(): string | null {
	const newsDir = getNewsDir();
	if (!fs.existsSync(newsDir)) {
		console.error(`News directory ${newsDir} not found`);
		return null;
	}

	return getAllNewsDates().at(-1) ?? null;
}

/**
 * Gets the dates of unread news posts for a user.
 * @param lastReadDate - The date of the last news post the user read, or null if never read
 * @returns Array of unread news post dates
 */
function getUnreadNewsDates(lastReadDate: string | null): string[] {
	const allDates = getAllNewsDates();

	if (allDates.length === 0) return [];

	// If user has never read news, all posts are unread
	if (!lastReadDate) return allDates;

	// Return posts newer than the last read date
	return allDates.filter((date) => date > lastReadDate);
}

/**
 * Counts the number of unread news posts for a user.
 * @param lastReadDate - The date of the last news post the user read (format: 'YYYY-MM-DD'), or null if never read
 * @returns The number of unread news posts
 */
function countUnreadNews(lastReadDate: string | null): number {
	return getUnreadNewsDates(lastReadDate).length;
}

// Exports ---------------------------------------------------------------------

export default { getLatestNewsDate, countUnreadNews, getUnreadNewsDates };
