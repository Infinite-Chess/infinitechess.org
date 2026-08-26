// src/server/utility/reqLogger.ts

/**
 * Logs each incoming HTTP request or websocket upgrade into `reqLog/`,
 * redacting sensitive tokens and omitting high-PII request bodies.
 */

import type { IncomingMessage } from 'node:http';
import type { Request, Response } from 'express';

import ip from './ip.js';
import logEvents from './logEvents.js';

// Functions -------------------------------------------------------------------

/** Logs one incoming request or websocket upgrade into `reqLog`. */
function incoming(req: IncomingMessage): void {
	const clientIP = ip.get(req) || 'Unknown ip';
	const origin = req.headers.origin || 'Unknown origin';
	const agent = req.headers['user-agent'] || 'Unknown agent';

	// Redact sensitive tokens that appear in URL paths so they are never written to log files.
	const sanitizedUrl = req
		.url!.replace(/(\/reset-password\/)([^?#/]+)/, '$1[REDACTED]')
		.replace(/(\/verify\/)([^?#/]+)/, '$1[REDACTED]')
		.replace(/([?&]username=)[^&#]+/, '$1[REDACTED]'); // Redact usernames (e.g. the availability check's ?username=)

	// Distinguish websocket upgrade requests (GETs to '/' with an Upgrade header)
	const method = req.headers.upgrade ? `${req.method} (WS upgrade)` : req.method;

	// Bodies are high-PII and left out
	const logThis = `${origin}   ${clientIP}   ${method}   ${sanitizedUrl}   ${agent}`;
	logEvents.add(logThis, 'reqLog');
}

/** Middleware that logs the incoming HTTP request. */
function middleware(req: Request, _res: Response, next: () => void): void {
	incoming(req);
	next(); // Continue to next middleware
}

// Exports ---------------------------------------------------------------------

export default { incoming, middleware };
