import path from 'path';
import fs from 'fs';

import { readFile } from '../utility/lockFile.js';
import { writeFile_ensureDirectory } from '../utility/fileUtils.js';

const bannedPath = path.resolve('database/banned.json');
(function ensureBannedFileExists() {
    if (fs.existsSync(bannedPath)) return; // Already exists

    const content = JSON.stringify({
        emails: {},
        IPs: {},
        "browser-ids": {}
    }, null, 2);
    writeFile_ensureDirectory(bannedPath, content);
    console.log("Generated banned file");
})();

const bannedJSON = await readFile(bannedPath, 'Unable to read banned.json on startup.');


function isEmailBanned(email) {
    const emailLowercase = email.toLowerCase();
    return bannedJSON.emails[emailLowercase] !== undefined;
}

function isIPBanned(ip) {
    return bannedJSON.IPs[ip] !== undefined;
}

function isBrowserIDBanned(browserID) {
    return bannedJSON['browser-ids'][browserID] !== undefined;
}

export {
    isEmailBanned,
    isIPBanned,
    isBrowserIDBanned
};
