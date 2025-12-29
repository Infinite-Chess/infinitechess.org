// build/env.js

/**
 * Ensures the .env file exists, generating it with default values if it doesn't.
 * And ensures its contents are valid.
 */

import fs from 'fs';
import crypto from 'crypto';
import dotenv from 'dotenv';

const envPath = '.env';

/** Ensure .env file exists and is valid. */
export function setupEnv() {
	ensureExists();
	ensureValid();
}

/** Ensure .env exists, generating it with default values if it doesn't. */
function ensureExists() {
	if (fs.existsSync(envPath)) return;

	// Doesn't exist, generate it with default values

	const ACCESS_TOKEN_SECRET = generateSecret(32); // 32 bytes = 64 characters in hex
	const REFRESH_TOKEN_SECRET = generateSecret(32);

	const content = `
NODE_ENV=development
ACCESS_TOKEN_SECRET=${ACCESS_TOKEN_SECRET}
REFRESH_TOKEN_SECRET=${REFRESH_TOKEN_SECRET}
CERT_PATH=
AWS_REGION=
EMAIL_FROM_ADDRESS=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
HTTPPORT=80
HTTPSPORT=443
HTTPPORT_LOCAL=3000
HTTPSPORT_LOCAL=3443
GITHUB_API_KEY=
GITHUB_REPO=Infinite-Chess/infinitechess.org
APP_BASE_URL=https://www.infinitechess.org
	`;

	fs.writeFileSync(envPath, content.trim());

	console.log('Generated .env file');

	// Immediately UPDATE the contents of process.env
	dotenv.config();
}

/**
 * Generate a random string of specified length.
 * @param {number} length - The length of the generated string, in bytes. The resulting string will be double this amount in characters.
 * @returns {string} - The generated random string
 */
function generateSecret(length) {
	return crypto.randomBytes(length).toString('hex');
}

/** Ensures some existing environment variables are valid. */
function ensureValid() {
	const NODE_ENV = process.env.NODE_ENV;
	const validValues = ['development', 'production', 'test']; // 'test' only appears during Vitest unit testing.

	if (!validValues.includes(NODE_ENV)) {
		throw new Error(
			`NODE_ENV environment variable must be either 'development', 'production', or 'test', received '${NODE_ENV}'.`,
		);
	}
}
