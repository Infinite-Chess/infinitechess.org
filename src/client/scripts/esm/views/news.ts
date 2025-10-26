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
	if (!username) return;

	try {
		const response = await fetch('/api/news/mark-read', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'is-fetch-request': 'true'
			}
		});

		if (response.ok) {
			// Dispatch event to update header badge
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
		padding: 2px 6px;
		border-radius: 3px;
		font-size: 0.75em;
		font-weight: bold;
		box-shadow: 0 1px 3px rgba(0,0,0,0.2);
	`;

	// Find the date span and wrap both date and badge in a flex container
	const dateSpan = postElement.querySelector('.news-post-date');
	if (dateSpan && dateSpan.parentNode) {
		// Create a wrapper div with flexbox
		const wrapper = document.createElement('div');
		wrapper.style.cssText = `
			display: inline-flex;
			justify-content: flex-start;
			align-items: center;
			gap: 8px;
			margin-top: 1em;
		`;
		
		// Remove margin-top from date span since wrapper now has it
		(dateSpan as HTMLElement).style.marginTop = '0';
		
		// Replace the date span with the wrapper
		dateSpan.parentNode.insertBefore(wrapper, dateSpan);
		wrapper.appendChild(dateSpan);
		wrapper.appendChild(badge);
	} else {
		// If no date span, add it at the top of the post
		postElement.insertBefore(badge, postElement.firstChild);
	}
}

/**
 * Initializes the news page functionality
 */
async function init(): Promise<void> {
	const username = validatorama.getOurUsername();
	
	if (username) {
		// Fetch unread news dates first
		const unreadDates = await fetchUnreadNewsDates();
		
		// Add NEW badges to unread posts
		if (unreadDates.length > 0) {
			addNewBadgesToUnreadPosts(unreadDates);
		}
		
		markNewsAsRead();
	}
}

init();

export {};
