// src/utility/urlUtils.ts

import 'dotenv/config'; // Imports all properties of process.env, if it exists

/**
 * Gets the base URL for the application, respecting the environment.
 * @returns The full base URL for the current environment.
 */
export function getAppBaseUrl(): string {
	if (process.env['NODE_ENV'] !== 'production') {
		// In development, construct the localhost URL
		return `https://localhost:${process.env['HTTPSPORT_LOCAL']}`;
	} else {
		// In production, use the base URL from the environment variables
		return process.env['APP_BASE_URL']!;
	}
}
