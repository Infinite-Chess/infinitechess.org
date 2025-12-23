import path from 'path';
import fs from 'fs';

import { readFile } from '../utility/lockFile.js';

const bannedPath = path.resolve('database/banned.json');

ensureBannedFileExists: {
	if (fs.existsSync(bannedPath)) break ensureBannedFileExists; // Already exists

	const content = JSON.stringify(
		{
			emails: {},
			IPs: {},
			'browser-ids': {},
		},
		null,
		2,
	);

	fs.mkdirSync(path.dirname(bannedPath), { recursive: true });
	fs.writeFileSync(bannedPath, content);

	console.log('Generated banned file');
}

let bannedJSON: {
	IPs: Record<string, any>;
	emails: Record<string, any>;
	'browser-ids': Record<string, any>;
};
try {
	bannedJSON = await readFile(bannedPath);
} catch (e) {
	const errMsg =
		'Unable to read banned.json on startup. ' + (e instanceof Error ? e.stack : String(e));
	throw new Error(errMsg);
}
// EMAIL BANS are now handled in the email_blacklist database table!
// function isEmailBanned(email: string): boolean {
// 	const emailLowercase = email.toLowerCase();
// 	return bannedJSON.emails[emailLowercase] !== undefined;
// }

function isIPBanned(ip: string): boolean {
	return bannedJSON.IPs[ip] !== undefined;
}

function isBrowserIDBanned(browserID: string): boolean {
	return bannedJSON['browser-ids'][browserID] !== undefined;
}

export { isIPBanned, isBrowserIDBanned };
