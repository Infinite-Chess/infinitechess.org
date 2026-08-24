// src/server/middleware/rateLimit.ts

/**
 * HTTP rate-limiting middleware wrapping the shared request-metering engine
 * (utility/requestMeter.ts), which also meters websocket connections.
 */

import type { Request, Response, NextFunction } from 'express';

import requestMeter from '../utility/requestMeter.js';
import renderContext from '../utility/renderContext.js';
import { isIPBanned } from './banned.js';
import { getClientIP } from '../utility/IP.js';
import { logEvents, logEventsAndPrint } from '../utility/logEvents.js';

import 'dotenv/config'; // Imports all properties of process.env, if it exists

/**
 * Whether the server is running in development mode.
 * It will be hosted on a different port for local host,
 * and a few other minor adjustments.
 */
const DEV_BUILD = process.env['NODE_ENV'] === 'development';

/** Whether we are currently rate limiting connections.
 * Only disable temporarily for development purposes. */
const ARE_RATE_LIMITING = !DEV_BUILD; // Set to false to temporarily get around it, during development.
if (!DEV_BUILD && !ARE_RATE_LIMITING) {
	throw new Error('ARE_RATE_LIMITING must be true in production!!');
}

/**
 * Middleware that counts this IP address's recent connections,
 * and rejects this request if they've sent too many.
 * @param req - The request object
 * @param res - The response object
 * @param next - The function to call, when finished, to continue the middleware waterfall.
 */
function rateLimit(req: Request, res: Response, next: NextFunction): void {
	if (!ARE_RATE_LIMITING) return next(); // Not rate limiting

	requestMeter.recordRecent();

	const clientIP = getClientIP(req);
	if (!clientIP) {
		logEvents('Unable to identify client IP address.', 'errLog');
		res.status(400).json({ message: 'Unable to identify IP address' });
		return;
	}

	if (isIPBanned(clientIP)) {
		const logThis = `Banned IP ${clientIP} tried to connect! ${req.headers.origin}   ${clientIP}   ${req.method}   ${req.url}   ${req.headers['user-agent'] || 'Unknown agent'}`;
		logEvents(logThis, 'bannedIPLog');
		res.status(403).json({ message: 'You are banned' });
		return;
	}

	const userAgent = req.headers['user-agent'];
	if (!userAgent) {
		// Occasionally, automatated scanner and vulnerability prober bots will omit the user agent.
		res.status(400).json({ message: 'User agent is required' });
		return;
	}

	const retryAfterSeconds = requestMeter.meter(clientIP, userAgent);
	if (retryAfterSeconds !== undefined) {
		// Rate limited (too many requests sent)
		respondRateLimited(req, res, retryAfterSeconds);
		return;
	}

	next(); // Continue the middleware waterfall
}

/**
 * Sends the 429 (Too Many Requests) response, content-negotiated on the Accept header:
 * - HTML  → the shared error page. Its styles live in global.css (already cached for any
 *   visitor who reached the limit), so it renders fully styled without making a new request
 *   that would itself be rate limited. SKIPPED while under attack mode (see utility/requestMeter.ts).
 * - JSON  → `{ message }`.
 * - else  → the message as plain text.
 * @param retryAfterSec - The number of seconds until they should retry, for the Retry-After header and error page context.
 */
function respondRateLimited(req: Request, res: Response, retryAfterSec: number): void {
	res.status(429).set('Retry-After', String(retryAfterSec)); // Standard hint for how long until they should retry
	const message = req.t.responses.rate_limiting.generic;

	if (
		req.accepts('html') &&
		req.get('Sec-Fetch-Mode') === 'navigate' &&
		!requestMeter.isUnderAttack()
	) {
		// Request accepts html AND is likely a browser, not a bot.
		// Rendered here instead of via renderErrorPage: that runs resolveAuth, which needs req.cookies
		// (not parsed yet at this point in the stack) and does DB work we must avoid for throttled clients.
		res.render(
			'error.njk',
			renderContext.getErrorPageContext(req, 429, retryAfterSec),
			// Handle render errors manually instead of next(err), so a failure here doesn't bubble
			// into the error handler (which would itself try to render and could loop).
			(renderErr: Error | null, html: string) => {
				if (!renderErr) {
					res.send(html);
				} else {
					logEventsAndPrint(
						`Critical error in rateLimit.ts rendering 429 page: ${renderErr.stack}`,
						'errLog',
					);
					res.send(message);
				}
			},
		);
	} else if (req.accepts('json')) {
		res.json({ message });
	} else {
		res.send(message);
	}
}

export default rateLimit;
