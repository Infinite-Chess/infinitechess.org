// src/client/scripts/esm/components/header/news-notification.js

/**
 * This script handles the unread news notification badge in the header.
 * It fetches the count of unread news posts and displays a red circle badge
 * next to the News link when there are unread posts.
 */

import validatorama from '../../util/validatorama.js';

const newsLink = document.querySelector('a[href*="/news"]');
let notificationBadge = null;

/**
 * Creates and returns the notification badge element
 */
function createNotificationBadge() {
	const badge = document.createElement('span');
	badge.className = 'news-notification-badge';
	badge.style.cssText = `
		position: absolute;
		top: 2px;
		right: 2px;
		background-color: #ff4444;
		border-radius: 50%;
		width: 8px;
		height: 8px;
		display: block;
		box-shadow: 0 2px 4px rgba(0,0,0,0.3);
		pointer-events: none;
	`;
	return badge;
}

/**
 * Fetches the unread news count from the server
 */
async function fetchUnreadNewsCount() {
	try {
		const response = await fetch('/api/news/unread-count', {
			headers: {
				'is-fetch-request': 'true'
			}
		});
		
		if (!response.ok) {
			console.error('Failed to fetch unread news count');
			return 0;
		}
		
		const data = await response.json();
		return data.count || 0;
	} catch (error) {
		console.error('Error fetching unread news count:', error);
		return 0;
	}
}

/**
 * Updates the notification badge display
 */
async function updateNotificationBadge() {
	// Only show badge if user is logged in
	const username = validatorama.getOurUsername();
	if (!username) {
		removeNotificationBadge();
		return;
	}

	const count = await fetchUnreadNewsCount();
	
	if (count > 0) {
		showNotificationBadge(count);
	} else {
		removeNotificationBadge();
	}
}

/**
 * Shows the notification badge with the given count
 * @param {number} _count - The number of unread news posts (unused, badge is just a dot)
 */
// eslint-disable-next-line no-unused-vars
function showNotificationBadge(_count) {
	if (!newsLink) {
		return;
	}
	
	// Make sure the news link has position relative for absolute positioning
	if (getComputedStyle(newsLink).position === 'static') {
		newsLink.style.position = 'relative';
	}
	
	if (!notificationBadge) {
		notificationBadge = createNotificationBadge();
		newsLink.appendChild(notificationBadge);
	}
	
	// Badge is just a dot, no text content needed
}

/**
 * Removes the notification badge
 */
function removeNotificationBadge() {
	if (notificationBadge && notificationBadge.parentNode) {
		notificationBadge.remove();
		notificationBadge = null;
	}
}

/**
 * Initializes the news notification feature
 */
function init() {
	if (!newsLink) {
		console.warn('News link not found in header');
		return;
	}
	
	// Update on page load
	updateNotificationBadge();
	
	// Update when login state changes
	document.addEventListener('login', updateNotificationBadge);
	document.addEventListener('logout', () => removeNotificationBadge());
	
	// Listen for custom event when news is marked as read
	document.addEventListener('news-marked-read', () => {
		updateNotificationBadge();
	});
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', init);
} else {
	init();
}

export default {
	updateNotificationBadge,
	removeNotificationBadge
};
