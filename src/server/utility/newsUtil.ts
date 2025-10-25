// src/server/utility/newsUtil.ts

/**
 * Utility functions for handling news posts and tracking read status.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Gets the date of the latest news post by reading filenames from the news directory.
 * News posts are named with dates like "2025-11-01.md"
 * @param language - The language code (e.g., 'en-US')
 * @returns The date string of the latest news post (e.g., '2025-11-01'), or null if no news posts exist
 */
function getLatestNewsDate(language: string = 'en-US'): string | null {
	const newsPath = path.join(__dirname, '../../../translation/news', language);
	
	if (!fs.existsSync(newsPath)) {
		console.error(`News directory not found for language: ${language}`);
		return null;
	}

	const files = fs.readdirSync(newsPath);
	const newsFiles = files.filter(file => file.endsWith('.md'));

	if (newsFiles.length === 0) {
		return null;
	}

	// Extract dates from filenames (format: YYYY-MM-DD.md)
	const dates = newsFiles.map(file => file.replace('.md', '')).sort();
	
	// Return the most recent date
	const latestDate = dates[dates.length - 1];
	return latestDate !== undefined ? latestDate : null;
}

/**
 * Gets all news post dates for a specific language.
 * @param language - The language code (e.g., 'en-US')
 * @returns Array of date strings sorted from oldest to newest
 */
function getAllNewsDates(language: string = 'en-US'): string[] {
	const newsPath = path.join(__dirname, '../../../translation/news', language);
	
	if (!fs.existsSync(newsPath)) {
		return [];
	}

	const files = fs.readdirSync(newsPath);
	const newsFiles = files.filter(file => file.endsWith('.md'));
	
	// Extract dates and sort
	const dates = newsFiles.map(file => file.replace('.md', '')).sort();
	return dates;
}

/**
 * Counts the number of unread news posts for a user.
 * @param lastReadDate - The date of the last news post the user read (format: 'YYYY-MM-DD'), or null if never read
 * @param language - The language code
 * @returns The number of unread news posts
 */
function countUnreadNews(lastReadDate: string | null, language: string = 'en-US'): number {
	const allDates = getAllNewsDates(language);
	
	if (allDates.length === 0) {
		return 0;
	}

	// If user has never read news, all posts are unread
	if (!lastReadDate) {
		return allDates.length;
	}

	// Count posts newer than the last read date
	const unreadCount = allDates.filter(date => date > lastReadDate).length;
	return unreadCount;
}

/**
 * Gets the dates of unread news posts for a user.
 * @param lastReadDate - The date of the last news post the user read, or null if never read
 * @param language - The language code
 * @returns Array of unread news post dates
 */
function getUnreadNewsDates(lastReadDate: string | null, language: string = 'en-US'): string[] {
	const allDates = getAllNewsDates(language);
	
	if (allDates.length === 0) {
		return [];
	}

	// If user has never read news, all posts are unread
	if (!lastReadDate) {
		return allDates;
	}

	// Return posts newer than the last read date
	return allDates.filter(date => date > lastReadDate);
}

export {
	getLatestNewsDate,
	getAllNewsDates,
	countUnreadNews,
	getUnreadNewsDates,
};
