
// src/utility/urlUtils.ts

// @ts-ignore
import { DEV_BUILD, HOST_NAME } from '../config/config.js';

/**
 * Gets the base URL for the application, respecting the environment.
 * @returns The full base URL (e.g., https://localhost:3001 or https://yourdomain.com)
 */
export function getAppBaseUrl(): string {
	const host = DEV_BUILD ? `localhost:${process.env['HTTPSPORT_LOCAL']}` : HOST_NAME;
	return `https://${host}`;
}