// src/server/utility/IP.ts

/**
 * This module reads the IP address attached to incoming
 * requests and websocket connection requests.
 */

import type { IncomingMessage } from 'http';

/**
 * Reads the client IP address attached to the incoming request.
 *
 * We read Cloudflare's `cf-connecting-ip` header, which Cloudflare overwrites on
 * every request with a single, trusted client IP (any client-supplied value is
 * stripped). This cannot be forged, unless traffic doesn't come through Cloudflare.
 * @param req - The incoming HTTP request or websocket upgrade request.
 * @returns The client IP as a string, or `undefined` if it can't be determined (e.g. closed socket).
 */
export function getClientIP(req: IncomingMessage): string | undefined {
	const cfConnectingIP = req.headers['cf-connecting-ip'];
	if (typeof cfConnectingIP === 'string') return cfConnectingIP;

	// Fallback for non-Cloudflare contexts (e.g. local development),
	// where the raw socket peer IS the client.
	return req.socket.remoteAddress;
}
