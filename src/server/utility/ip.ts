// src/server/utility/ip.ts

/**
 * This module reads the IP address attached to incoming
 * requests and websocket connection requests, and the network an address belongs to.
 */

import type { IncomingMessage } from 'http';

import ipaddr from 'ipaddr.js';

// Constants -------------------------------------------------------------------

/** The groups of an IPv6 address naming its network: the /64 one site is assigned. */
const IPV6_NETWORK_GROUPS = 4;

// Functions -------------------------------------------------------------------

/**
 * Reads the client IP address attached to the incoming request.
 *
 * We read Cloudflare's `cf-connecting-ip` header, which Cloudflare overwrites on
 * every request with a single, trusted client IP (any client-supplied value is
 * stripped). This cannot be forged, unless traffic doesn't come through Cloudflare.
 * `req.ip` isn't available for raw websocket upgrade requests.
 * @param req - The incoming HTTP request or websocket upgrade request.
 * @returns The client IP as a string, or `undefined` if it can't be determined (e.g. closed socket).
 */
function get(req: IncomingMessage): string | undefined {
	const cfConnectingIP = req.headers['cf-connecting-ip'];
	if (typeof cfConnectingIP === 'string') return cfConnectingIP;

	// Fallback for non-Cloudflare contexts (e.g. local development),
	// where the raw socket peer IS the client.
	return req.socket.remoteAddress;
}

/**
 * The network an IP address belongs to, as a string equal for every address on it: an IPv4
 * address itself, or an IPv6 address's /64 prefix, within which each device of a home or phone
 * hotspot picks its own address.
 */
function networkOf(address: string): string {
	const parsed = ipaddr.process(address); // An IPv4 address mapped into IPv6 comes back as IPv4.
	if (parsed.kind() === 'ipv4') return parsed.toString();
	const groups = parsed.toNormalizedString().split(':');
	return groups.slice(0, IPV6_NETWORK_GROUPS).join(':');
}

// Exports ---------------------------------------------------------------------

export default { get, networkOf };
