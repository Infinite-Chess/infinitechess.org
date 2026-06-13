// src/server/middleware/reqLogger.ts

/**
 * Express middleware that logs each incoming HTTP request into `reqLog/`,
 * redacting sensitive tokens and omitting high-PII request bodies.
 */

import type { Request, Response } from 'express';

import { logEvents } from './logEvents.js';
import { getClientIP } from '../utility/IP.js';

/** Middleware that logs the incoming request, then calls `next()`. */
function reqLogger(req: Request, _res: Response, next: () => void): void {
	const clientIP = getClientIP(req) || 'Unknown ip';

	const origin = req.headers.origin || 'Unknown origin';

	// Redact sensitive tokens that appear in URL paths so they are never written to log files.
	const sanitizedUrl = req.url
		.replace(/(\/reset-password\/)([^?#/]+)/, '$1[REDACTED]')
		.replace(/(\/verify\/[^/]+\/)([^?#/]+)/, '$1[REDACTED]')
		.replace(/([?&]username=)[^&#]+/, '$1[REDACTED]'); // Redact usernames (e.g. the availability check's ?username=)

	// Bodies are high-PII and left out
	const logThis = `${origin}   ${clientIP}   ${req.method}   ${sanitizedUrl}   ${req.headers['user-agent']}`;

	logEvents(logThis, 'reqLog');

	next(); // Continue to next middleware
}

export { reqLogger };
