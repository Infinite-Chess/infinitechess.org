// src/server/middleware/reqLogger.ts

/**
 * Logs each incoming HTTP request or websocket upgrade into `reqLog/`,
 * redacting sensitive tokens and omitting high-PII request bodies.
 */

import type { IncomingMessage } from 'node:http';
import type { Request, Response } from 'express';

import { logEvents } from './logEvents.js';
import { getClientIP } from '../utility/IP.js';

/** Logs one incoming request or websocket upgrade into `reqLog`. */
function logIncomingRequest(req: IncomingMessage): void {
	const clientIP = getClientIP(req) || 'Unknown ip';
	const origin = req.headers.origin || 'Unknown origin';

	// Redact sensitive tokens that appear in URL paths so they are never written to log files.
	const sanitizedUrl = req
		.url!.replace(/(\/reset-password\/)([^?#/]+)/, '$1[REDACTED]')
		.replace(/(\/verify\/[^/]+\/)([^?#/]+)/, '$1[REDACTED]')
		.replace(/([?&]username=)[^&#]+/, '$1[REDACTED]'); // Redact usernames (e.g. the availability check's ?username=)

	// Distinguish websocket upgrade requests (GETs to '/' with an Upgrade header)
	const method = req.headers.upgrade ? `${req.method} (WS upgrade)` : req.method;

	// Bodies are high-PII and left out
	const logThis = `${origin}   ${clientIP}   ${method}   ${sanitizedUrl}   ${req.headers['user-agent']}`;
	logEvents(logThis, 'reqLog');
}

/** Middleware that logs the incoming HTTP request. */
function reqLogger(req: Request, _res: Response, next: () => void): void {
	logIncomingRequest(req);
	next(); // Continue to next middleware
}

export { reqLogger, logIncomingRequest };
