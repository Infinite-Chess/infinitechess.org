// src/server/config/env.ts

/**
 * The server's environment variables: loads `.env` once, validates every variable, and exports
 * them typed. The only server module that may read `process.env` (ESLint enforces it), so no
 * module depends on import order to find `.env` already loaded.
 *
 * Throws at boot, naming every missing or invalid variable at once. Variables only production
 * requires are optional elsewhere, so local development needs no real keys.
 */

import * as z from 'zod';

import 'dotenv/config';

// Constants -------------------------------------------------------------------

/** Read unvalidated, only to pick the rules below. An invalid NODE_ENV still fails the parse. */
const IS_PRODUCTION = process.env['NODE_ENV'] === 'production';

// Schemas ---------------------------------------------------------------------

/** A port. Parsed as a string first, so a missing one reports as missing rather than NaN. */
const PortSchema = z.string().pipe(z.coerce.number<string>().int());

/** A variable only production requires. */
const ProductionOnlySchema = IS_PRODUCTION ? z.string() : z.string().optional();

const EnvSchema = z.object({
	NODE_ENV: z.enum(['development', 'production', 'test']),
	REFRESH_TOKEN_SECRET: z.string(),
	HTTPPORT: PortSchema,
	HTTPSPORT: PortSchema,
	HTTPPORT_LOCAL: PortSchema,
	HTTPSPORT_LOCAL: PortSchema,
	APP_BASE_URL: z.string(),
	GITHUB_REPO: z.string(),
	TURNSTILE_SITE_KEY: ProductionOnlySchema,
	TURNSTILE_SECRET_KEY: ProductionOnlySchema,
	AWS_REGION: ProductionOnlySchema,
	/** Who our sent emails appear to be from, and where alerts to ourselves are sent. */
	EMAIL_FROM_ADDRESS: ProductionOnlySchema,
	AWS_ACCESS_KEY_ID: ProductionOnlySchema,
	AWS_SECRET_ACCESS_KEY: ProductionOnlySchema,
	RESTART_SECRET: ProductionOnlySchema,
	GITHUB_API_KEY: ProductionOnlySchema,
});

// Validation ------------------------------------------------------------------

/** `KEY=` in `.env` reads as an empty string, which counts as unset. */
const setVariables = Object.fromEntries(
	Object.entries(process.env).filter(([, value]) => value !== ''),
);

const result = EnvSchema.safeParse(setVariables);
if (!result.success)
	throw new Error(`Invalid environment variables:\n${z.prettifyError(result.error)}`);

// Exports ---------------------------------------------------------------------

export default result.data;
