const path = require('path');
const fs = require('fs');

const { writeFile_ensureDirectory } = require('../utility/fileUtils');

const bannedPath = path.resolve('../../../database/banned.json');
(function ensureBannedFileExists() {
    if (fs.existsSync(bannedPath)) return; // Already exists

    const content = JSON.stringify({
        emails: {},
        IPs: {},
        "browser-ids": {}
    }, null, 2);
    writeFile_ensureDirectory(bannedPath, content)
    console.log("Generated banned file")
})()
const bannedJSON = require('../../../database/banned.json');



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



module.exports = {
    isEmailBanned,
    isIPBanned,
    isBrowserIDBanned
};
