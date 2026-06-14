// src/server/middleware/turnstile.ts

/**
 * Cloudflare Turnstile verification helper.
 *
 * Verifies a Turnstile token server-side via Cloudflare's siteverify
 * endpoint, so forms an reject submissions that lack a valid bot-check token.
 */

import type { IncomingMessage } from 'http';

import { getClientIP } from '../utility/IP.js';
import { logEventsAndPrint } from './logEvents.js';

// Types -------------------------------------------------------------------------

/**
 * The result of verifying a Turnstile token:
 * - `'success'` — the token is valid.
 * - `'failed'` — the token is missing or invalid; reject the request.
 * - `'error'` — siteverify could not be reached or misbehaved; reject the request
 *   with a retry message.
 */
type TurnstileResult = 'success' | 'failed' | 'error';

// Variables -------------------------------------------------------------------------

/**
 * Cloudflare's documented dummy keys, used in development when real keys are unset
 * so local dev needs no real Turnstile account. Both always pass verification.
 */
const TEST_SITE_KEY = '1x00000000000000000000AA'; // Always passes, visible widget (default)
// const TEST_SITE_KEY = '2x00000000000000000000AB'; // Always fails, visible widget
// const TEST_SITE_KEY = '1x00000000000000000000BB'; // Always passes, invisible widget
// const TEST_SITE_KEY = '2x00000000000000000000BB'; // Always fails, invisible widget
// const TEST_SITE_KEY = '3x00000000000000000000FF'; // Forces interactive challenge, visible widget

const TEST_SECRET_KEY = '1x0000000000000000000000000000000AA'; // Always passes validation
// const TEST_SECRET_KEY = '2x0000000000000000000000000000000AA'; // Always fails validation
// const TEST_SECRET_KEY = '3x0000000000000000000000000000000AA'; // Returns "token already spent" error

// In production the real Turnstile keys are mandatory. Fail fast if missing.
if (process.env['NODE_ENV'] === 'production') {
	if (!process.env['TURNSTILE_SITE_KEY']) throw new Error('Missing TURNSTILE_SITE_KEY');
	if (!process.env['TURNSTILE_SECRET_KEY']) throw new Error('Missing TURNSTILE_SECRET_KEY');
}

/**
 * The public Turnstile site key, rendered into the widget. Pulled from the env in
 * production (asserted present above); falls back to the always-pass test key otherwise.
 */
const TURNSTILE_SITE_KEY: string = process.env['TURNSTILE_SITE_KEY'] ?? TEST_SITE_KEY;
/**
 * The server-only Turnstile secret key, used to verify tokens. Pulled from the env in
 * production (asserted present above); falls back to the always-pass test secret otherwise.
 */
const TURNSTILE_SECRET_KEY: string = process.env['TURNSTILE_SECRET_KEY'] ?? TEST_SECRET_KEY;

/** Cloudflare's token verification endpoint. */
const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

// Functions -------------------------------------------------------------------------

/**
 * Verifies a Cloudflare Turnstile token against the siteverify endpoint.
 * @param token - The `cf-turnstile-response` value supplied by the client.
 * @param req - The incoming request, used to forward the real client IP (`remoteip`).
 * @returns The verification outcome. Callers must reject on both `'failed'` and `'error'`.
 */
async function verifyTurnstileToken(
	token: unknown,
	req: IncomingMessage,
): Promise<TurnstileResult> {
	if (!token || typeof token !== 'string') return 'failed';

	const body = new URLSearchParams({ secret: TURNSTILE_SECRET_KEY, response: token });
	const remoteip = getClientIP(req);
	if (remoteip !== undefined) body.append('remoteip', remoteip);

	try {
		const response = await fetch(SITEVERIFY_URL, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body,
		});
		if (!response.ok) {
			// Can only fire on infrastructure-level problems
			logEventsAndPrint(`Turnstile siteverify returned HTTP ${response.status}.`, 'errLog');
			return 'error';
		}
		const data = (await response.json()) as { success?: boolean };
		return data.success === true ? 'success' : 'failed';
	} catch (error: unknown) {
		const detail = error instanceof Error ? error.stack : String(error);
		logEventsAndPrint(`Turnstile siteverify request failed: ${detail}`, 'errLog');
		return 'error';
	}
}

// Exports ------------------------------------------------

export { TURNSTILE_SITE_KEY, verifyTurnstileToken };
