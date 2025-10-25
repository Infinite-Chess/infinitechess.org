// src/client/scripts/esm/views/news.ts

/**
 * This script runs on the news page.
 * It marks news as read when the page is visited and adds "NEW" badges to unread posts.
 */

import validatorama from '../util/validatorama.js';

/**
 * Marks all news as read for the current user
 */
async function markNewsAsRead(): Promise<void> {
	// Only mark as read if user is logged in
	const username = validatorama.getOurUsername();
	console.log('markNewsAsRead called, username:', username);
	if (!username) return;

	try {
		console.log('Calling /api/news/mark-read...');
		const response = await fetch('/api/news/mark-read', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'is-fetch-request': 'true'
			}
		});

		console.log('Mark-read response status:', response.status, response.ok);
		if (response.ok) {
			// Dispatch event to update header badge
			console.log('Dispatching news-marked-read event');
			document.dispatchEvent(new CustomEvent('news-marked-read'));
		}
	} catch (error) {
		console.error('Error marking news as read:', error);
	}
}

/**
 * Fetches the list of unread news dates
 */
async function fetchUnreadNewsDates(): Promise<string[]> {
	try {
		const response = await fetch('/api/news/unread-dates', {
			headers: {
				'is-fetch-request': 'true'
			}
		});

		if (!response.ok) return [];

		const data = await response.json();
		return data.dates || [];
	} catch (error) {
		console.error('Error fetching unread news dates:', error);
		return [];
	}
}

/**
 * Adds "NEW" badges to unread news posts
 */
function addNewBadgesToUnreadPosts(unreadDates: string[]): void {
	if (unreadDates.length === 0) return;

	// Find all news post elements
	const newsPosts = document.querySelectorAll('.news-post');

	newsPosts.forEach((post) => {
		const postDate = (post as HTMLElement).dataset['date'];

		// Check if this post's date is in the unread list
		if (postDate && unreadDates.includes(postDate)) {
			addNewBadge(post as HTMLElement);
		}
	});
}

/**
 * Creates and adds a "NEW" badge to a news post
 */
function addNewBadge(postElement: HTMLElement): void {
	// Don't add if already exists
	if (postElement.querySelector('.new-badge')) return;

	const badge = document.createElement('span');
	badge.className = 'new-badge';
	badge.textContent = 'NEW';
	badge.style.cssText = `
		display: inline-block;
		background-color: #ff4444;
		color: white;
		padding: 4px 12px;
		border-radius: 4px;
		font-size: 12px;
		font-weight: bold;
		margin-left: 10px;
		vertical-align: middle;
		box-shadow: 0 2px 4px rgba(0,0,0,0.2);
	`;

	// Add it after the date span
	const dateSpan = postElement.querySelector('.news-post-date');
	if (dateSpan) {
		dateSpan.parentElement?.insertBefore(badge, dateSpan.nextSibling);
	} else {
		// If no date span, add it at the top of the post
		postElement.insertBefore(badge, postElement.firstChild);
	}
}

/**
 * Initializes the news page functionality
 */
async function init(): Promise<void> {
	console.log('News page script initialized');
	const username = validatorama.getOurUsername();
	console.log('Current username:', username);
	
	if (username) {
		// Fetch unread news dates first
		const unreadDates = await fetchUnreadNewsDates();
		console.log('Unread news dates:', unreadDates);
		
		// Add NEW badges to unread posts
		if (unreadDates.length > 0) {
			addNewBadgesToUnreadPosts(unreadDates);
		}
		
		// Mark news as read after a short delay to ensure user sees the page
		console.log('Setting timeout to mark news as read in 1 second...');
		setTimeout(() => {
			markNewsAsRead();
		}, 1000);
	}
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', init);
} else {
	init();
}

export {};
