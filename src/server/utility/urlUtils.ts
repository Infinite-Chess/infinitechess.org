// src/server/utility/urlUtils.ts

/**
 * Utility for constructing URLs that point back at this application,
 * respecting the current environment (development vs production).
 */

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

/** Builds the absolute `/game/:id` URL. Carries no perspective. */
function getAbsoluteGameUrl(id: number): string {
	return `${getAppBase()}${gameurl.getGameUrl(id)}`;
}

// Exports ---------------------------------------------------------------------

export default { getAppBase, getAbsoluteGameUrl };
