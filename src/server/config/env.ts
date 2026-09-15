// src/server/config/env.ts

/**
 * The server's environment variables: creates `.env` on first run, loads it once, validates
 * every variable, and exports them typed. The only server module that may read `process.env`
 * (ESLint enforces it), so no module depends on import order to find `.env` already loaded.
 *
 * Throws at boot, naming every missing or invalid variable at once.
 */

import fs from 'fs';
import crypto from 'crypto';
import dotenv from 'dotenv';
import * as z from 'zod';

// Constants -------------------------------------------------------------------

/** The env file the server creates and loads, relative to the working directory. */
const ENV_PATH = '.env';

// Schemas ---------------------------------------------------------------------

/** A port. Parsed as a string first, so a missing one reports as missing rather than NaN. */
const PortSchema = z.string().pipe(z.coerce.number<string>().int());

/** Variables every environment requires. */
const BaseSchema = z.object({
	NODE_ENV: z.enum(['development', 'production', 'test']),
	APP_BASE_URL: z.string(),
	HTTPPORT: PortSchema,
	/** In production, must match the HTTPSPORT repository variable for the Deploy workflow. */
	HTTPSPORT: PortSchema,
	HTTPPORT_LOCAL: PortSchema,
	HTTPSPORT_LOCAL: PortSchema,
	REFRESH_TOKEN_SECRET: z.string(),
	GITHUB_REPO: z.string(),
});

/** Variables only production requires. Optional elsewhere, so local development needs no real keys. */
const ProductionOnlySchema = z.object({
	RESTART_SECRET: z.string(),
	TURNSTILE_SITE_KEY: z.string(),
	TURNSTILE_SECRET_KEY: z.string(),
	AWS_REGION: z.string(),
	AWS_ACCESS_KEY_ID: z.string(),
	AWS_SECRET_ACCESS_KEY: z.string(),
	/** Who our sent emails appear to be from, and where alerts to ourselves are sent. */
	EMAIL_FROM_ADDRESS: z.string(),
	GITHUB_API_KEY: z.string(),
});

// Creation --------------------------------------------------------------------

/**
 * Writes `.env` listing every variable, so developers see all they can set: local
 * development values filled in, a fresh token secret, and the production-only keys blank.
 */
function createEnvFile(): void {
	const initialValues: z.input<typeof BaseSchema> = {
		NODE_ENV: 'development',
		APP_BASE_URL: 'https://www.infinitechess.org',
		HTTPPORT: '80',
		HTTPSPORT: '443',
		HTTPPORT_LOCAL: '3000',
		HTTPSPORT_LOCAL: '3443',
		REFRESH_TOKEN_SECRET: crypto.randomBytes(32).toString('hex'), // 32 bytes = 64 hex characters
		GITHUB_REPO: 'Infinite-Chess/infinitechess.org',
	};
	const lines = [
		// Parsed, so the lines follow the schema's order.
		...Object.entries(BaseSchema.parse(initialValues)).map(([key, value]) => `${key}=${value}`),
		...Object.keys(ProductionOnlySchema.shape).map((key) => `${key}=`),
	];
	fs.writeFileSync(ENV_PATH, lines.join('\n'));
	console.log('Generated .env file');
}

// Validation ------------------------------------------------------------------

if (!fs.existsSync(ENV_PATH)) createEnvFile();
dotenv.config({ path: ENV_PATH });

/** Read unvalidated, only to pick the schema below. An invalid NODE_ENV still fails the parse. */
const IS_PRODUCTION = process.env['NODE_ENV'] === 'production';
/** Every variable, with the production-only ones required only in production. */
const EnvSchema = IS_PRODUCTION
	? BaseSchema.extend(ProductionOnlySchema.shape)
	: BaseSchema.extend(ProductionOnlySchema.partial().shape);

/** `KEY=` in `.env` reads as an empty string, which counts as unset. */
const setVariables = Object.fromEntries(
	Object.entries(process.env).filter(([, value]) => value !== ''),
);

/** The env variables validated against {@link EnvSchema}. */
const result = EnvSchema.safeParse(setVariables);
if (!result.success)
	throw new Error(`Invalid environment variables:\n${z.prettifyError(result.error)}`);

// Exports ---------------------------------------------------------------------

export default result.data;
