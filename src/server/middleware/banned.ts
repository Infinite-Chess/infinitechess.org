import path from 'path';
import fs from 'fs';

import { readFile } from '../utility/lockFile.js';
// @ts-ignore
import { writeFile_ensureDirectory } from '../utility/fileUtils.js';

const bannedPath = path.resolve('database/banned.json');

ensureBannedFileExists: {
	if (fs.existsSync(bannedPath)) break ensureBannedFileExists; // Already exists

	const content = JSON.stringify({
		emails: {},
		IPs: {},
		"browser-ids": {}
	}, null, 2);
	writeFile_ensureDirectory(bannedPath, content);
	console.log("Generated banned file");
}

const bannedJSON = await readFile(bannedPath, 'Unable to read banned.json on startup.') as {
	IPs: Record<string, any>,
	emails: Record<string, any>,
	'browser-ids': Record<string, any>
};

function isEmailBanned(email: string) {
	const emailLowercase = email.toLowerCase();
	return bannedJSON.emails[emailLowercase] !== undefined;
}

function isIPBanned(ip: string) {
	return bannedJSON.IPs[ip] !== undefined;
}

function isBrowserIDBanned(browserID: string) {
	return bannedJSON['browser-ids'][browserID] !== undefined;
}

export {
	isEmailBanned,
	isIPBanned,
	isBrowserIDBanned
};
