// src/server/database/banned.ts

/**
 * Legacy JSON-backed ban store for IPs and browser-ids, read once at startup and consulted on
 * every request.
 *
 * Blacklisted EMAILS are handled separately in the email_blacklist database table
 * (see blacklistManager.ts).
 */

import fs from 'fs';
import path from 'path';

import jsutil from '../../shared/util/jsutil.js';

import env from '../config/env.js';

// Constants -------------------------------------------------------------------

const BANNED_PATH = path.resolve('database/banned.json');

// State -----------------------------------------------------------------------

/** The banned IPs, as loaded from {@link BANNED_PATH}. */
const bannedIPs = new Set<string>();

/** The banned browser-ids, as loaded from {@link BANNED_PATH}. */
const bannedBrowserIDs = new Set<string>();

// Startup ---------------------------------------------------------------------

ensureBannedFileExists: {
	if (fs.existsSync(BANNED_PATH)) break ensureBannedFileExists; // Already exists

	const content = JSON.stringify(
		{
			IPs: {},
			'browser-ids': {},
		},
		null,
		2,
	);

	fs.mkdirSync(path.dirname(BANNED_PATH), { recursive: true });
	fs.writeFileSync(BANNED_PATH, content);

	console.log('Generated banned file');
}

try {
	/** Each value is a free-form note on the ban, never read. */
	const bannedJSON: {
		IPs: Record<string, unknown>;
		'browser-ids': Record<string, unknown>;
	} = JSON.parse(fs.readFileSync(BANNED_PATH, 'utf-8'));
	for (const ip of Object.keys(bannedJSON.IPs)) bannedIPs.add(ip);
	for (const browserID of Object.keys(bannedJSON['browser-ids'])) bannedBrowserIDs.add(browserID);
} catch (error: unknown) {
	if (env.NODE_ENV === 'test') {
		console.warn('Unable to read banned.json in the test environment; no bans apply');
	} else {
		const message = jsutil.getErrorMessage(error);
		throw new Error('Unable to read banned.json on startup: ' + message);
	}
}

// Functions -------------------------------------------------------------------

/** Whether the IP address is banned. */
function isIP(ip: string): boolean {
	return bannedIPs.has(ip);
}

/** Whether the browser-id is banned. */
function isBrowserID(browserID: string): boolean {
	return bannedBrowserIDs.has(browserID);
}

// Exports ---------------------------------------------------------------------

export default { isIP, isBrowserID };
