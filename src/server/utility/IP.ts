/**
 * This module reads the IP address attached to incoming
 * requests and websocket connection requests.
 */

import type { Request } from 'express';

/**
 * Reads the IP address attached to the incoming request.
 * It prioritizes the 'x-forwarded-for' header, which is commonly used by
 * reverse proxies and load balancers like Cloudflare to convey the original client IP.
 *
 * @param req - The Express request object.
 * @returns The IP address of the request as a string, or `undefined` if not present.
 */
export function getClientIP(req: Request): string | undefined {
	const forwardedFor = req.headers['x-forwarded-for'];

	if (typeof forwardedFor === 'string') {
		// The 'x-forwarded-for' header can be a comma-separated list of IPs.
		// The first one is the original client IP.
		return forwardedFor.split(',')[0]!.trim();
	}

	// Fallback to req.ip, which is derived from req.socket.remoteAddress
	// (and should match the first entry in 'x-forwarded-for' if behind a proxy)
	return req.ip;
}
