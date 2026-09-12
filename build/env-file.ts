// build/env-file.ts

/**
 * Creates the .env file with default values if it doesn't exist.
 * The server validates its contents at startup, in src/server/config/env.ts.
 */

import fs from 'fs';
import crypto from 'crypto';
import dotenv from 'dotenv';

const envPath = '.env';

/** Creates .env with default values, if it doesn't exist. */
export function createEnvFile(): void {
	if (fs.existsSync(envPath)) return;

	// Doesn't exist, generate it with default values

	const REFRESH_TOKEN_SECRET = generateSecret(32); // 32 bytes = 64 characters in hex

	const content = `
NODE_ENV=development
REFRESH_TOKEN_SECRET=${REFRESH_TOKEN_SECRET}
RESTART_SECRET=
AWS_REGION=
EMAIL_FROM_ADDRESS=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
HTTPPORT=80
# In production, must match the HTTPSPORT repository variable for the Deploy workflow to work correctly.
HTTPSPORT=443
HTTPPORT_LOCAL=3000
HTTPSPORT_LOCAL=3443
GITHUB_API_KEY=
GITHUB_REPO=Infinite-Chess/infinitechess.org
APP_BASE_URL=https://www.infinitechess.org
TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=
	`;

	fs.writeFileSync(envPath, content.trim());

	console.log('Generated .env file');

	// Immediately UPDATE the contents of process.env
	dotenv.config();
}

/**
 * Generate a random string of specified length.
 * @param length - The length of the generated string, in bytes. The resulting string will be double this amount in characters.
 * @returns The generated random string
 */
function generateSecret(length: number): string {
	return crypto.randomBytes(length).toString('hex');
}
