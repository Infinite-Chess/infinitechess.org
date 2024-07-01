const fs = require('fs');
const crypto = require('crypto');

const envPath = '.env';

/**
 * Ensures the .env file exists, creating it with default values if it doesn't.
 */
function ensureEnvFile() {
    if (fs.existsSync(envPath)) return; // Already exists

    const ACCESS_TOKEN_SECRET = generateSecret(32); // 32 bytes = 64 characters in hex
    const REFRESH_TOKEN_SECRET = generateSecret(32);
    const content = `
ACCESS_TOKEN_SECRET=${ACCESS_TOKEN_SECRET}
REFRESH_TOKEN_SECRET=${REFRESH_TOKEN_SECRET}
EMAIL_USERNAME=
EMAIL_APP_PASSWORD=
HTTPPORT=80
HTTPSPORT=443
HTTPPORT_LOCAL=3000
HTTPSPORT_LOCAL=3443
    `;
    fs.writeFileSync(envPath, content.trim());
    console.log('Generated .env file');
}

/**
 * Generate a random string of specified length.
 * @param {number} length - The length of the generated string, in bytes. The resulting string will be double this amount in characters.
 * @returns {string} - The generated random string
 */
function generateSecret(length) {
    return crypto.randomBytes(length).toString('hex');
}


module.exports = { ensureEnvFile }