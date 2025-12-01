// src/utility/urlUtils.ts

// @ts-ignore
import { DEV_BUILD } from '../config/config.js';

/**
 * Gets the base URL for the application, respecting the environment.
 * @returns The full base URL for the current environment.
 */
export function getAppBaseUrl(): string {
	if (DEV_BUILD) {
		// In development, construct the localhost URL
		return `https://localhost:${process.env['HTTPSPORT_LOCAL']}`;
	} else {
		// In production, use the base URL from the environment variables
		return process.env['APP_BASE_URL']!;
	}
}
