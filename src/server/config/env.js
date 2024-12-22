import fs from 'fs';
import crypto from 'crypto';
import dotenv from 'dotenv';



ensureEnvFile();

// Load the .env file contents into process.env
// This needs to be as early as possible
dotenv.config(); 

/** The environment variable. @type {'development'|'production'} */
const NODE_ENV = process.env.NODE_ENV;
if (NODE_ENV !== 'development' && NODE_ENV !== 'production') throw new Error(`NODE_ENV environment variable must be either "development" or "production", received "${NODE_ENV}".`);



/**
 * Ensures the .env file exists, creating it with default values if it doesn't.
 */
function ensureEnvFile() {
	const envPath = '.env';
	if (fs.existsSync(envPath)) return; // Already exists

	const ACCESS_TOKEN_SECRET = generateSecret(32); // 32 bytes = 64 characters in hex
	const REFRESH_TOKEN_SECRET = generateSecret(32);
	const content = `
NODE_ENV=development
ACCESS_TOKEN_SECRET=${ACCESS_TOKEN_SECRET}
REFRESH_TOKEN_SECRET=${REFRESH_TOKEN_SECRET}
CERT_PATH=
EMAIL_USERNAME=
EMAIL_APP_PASSWORD=
HTTPPORT=80
HTTPSPORT=443
HTTPPORT_LOCAL=3000
HTTPSPORT_LOCAL=3443
GITHUB_API_KEY=
GITHUB_REPO=""
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


export { NODE_ENV };