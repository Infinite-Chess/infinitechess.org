// src/server/database/banned.ts

/**
 * Legacy JSON-backed ban store for IPs and browser-ids, consulted at startup of each request.
 *
 * Blacklisted EMAILS are handled separately in the email_blacklist database table
 * (see blacklistManager.ts).
 */

import fs from 'fs';
import path from 'path';

import jsutil from '../../shared/util/jsutil.js';

const BANNED_PATH = path.resolve('database/banned.json');

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

/** Each entry's value is a free-form note on the ban; only the key's presence is ever tested. */
let bannedJSON: {
	IPs: Record<string, unknown>;
	'browser-ids': Record<string, unknown>;
};
try {
	bannedJSON = JSON.parse(fs.readFileSync(BANNED_PATH, 'utf-8'));
} catch (error: unknown) {
	if (process.env['VITEST']) {
		console.warn('Mocking banned.json for test environment');
		bannedJSON = {
			IPs: {},
			'browser-ids': {},
		};
	} else {
		const message = jsutil.getErrorMessage(error);
		throw new Error('Unable to read banned.json on startup: ' + message);
	}
}

/** Whether the IP address is banned. */
function isIP(ip: string): boolean {
	return bannedJSON.IPs[ip] !== undefined;
}

/** Whether the browser-id is banned. */
function isBrowserID(browserID: string): boolean {
	return bannedJSON['browser-ids'][browserID] !== undefined;
}

// Exports ------------------------------------------------------------------------------------

export default { isIP, isBrowserID };
