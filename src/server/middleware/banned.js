import path from 'path';
import fs from 'fs';

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
import bannedJSON from '../../../database/banned.json' with { 'type': 'json' }



function isEmailBanned(email) {
    const emailLowercase = email.toLowerCase();
    return bannedJSON.emails[emailLowercase] != null;
}

function isIPBanned(ip) {
    return bannedJSON.IPs[ip] != null;
}

function isBrowserIDBanned(browserID) {
    return bannedJSON['browser-ids'][browserID] != null;
}



export {
    isEmailBanned,
    isIPBanned,
    isBrowserIDBanned
};
