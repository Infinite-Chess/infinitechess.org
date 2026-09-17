// src/server/utility/urlUtils.ts

/**
 * Utility for constructing URLs that point back at this application,
 * respecting the current environment (development vs production).
 */

import type { Player } from '../../shared/chess/util/typeutil.js';

import gameurl from '../../shared/chess/util/gameurl.js';

import env from '../config/env.js';

/**
 * Gets the base URL for the application, respecting the environment.
 * @returns The full base URL for the current environment.
 */
function getAppBase(): string {
	if (env.NODE_ENV !== 'production') {
		// In development, construct the localhost URL
		return `https://localhost:${env.HTTPSPORT_LOCAL}`;
	} else {
		// In production, use the base URL from the environment variables
		return env.APP_BASE_URL;
	}
}

/**
 * Builds the absolute `/game/:id` URL.
 * @param viewColor - The side to view the board from. Omit to use the side of whoever opens the link.
 */
function getAbsoluteGameUrl(id: number, viewColor?: Player): string {
	return `${getAppBase()}${gameurl.getGameUrl(id, viewColor)}`;
}

/**
 * Builds the absolute `/member/:username` profile URL.
 *
 * SUBJECT TO CHANGE when we redesign the member profile page.
 * At that time we may want to decide on and finalize the URL structure.
 */
function getAbsoluteMemberUrl(username: string): string {
	return `${getAppBase()}/member/${username.toLowerCase()}`;
}

// Exports ---------------------------------------------------------------------

export default { getAppBase, getAbsoluteGameUrl, getAbsoluteMemberUrl };
