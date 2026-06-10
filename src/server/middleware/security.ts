// src/server/middleware/security.ts

/**
 * The ordered security middleware stack, applied as one unit by the middleware waterfall.
 * Order matters: enforce HTTPS → set security headers (CSP) → block path traversal → apply CORS.
 */

import cors from 'cors';

import pathTraversal from './pathTraversal.js';
import secureRedirect from './secureRedirect.js';
import contentSecurityPolicy from './contentSecurityPolicy.js';

const security = [
	secureRedirect, // Redirects http to secure https
	// CSP (Content Security Policy) headers (XSS mitigation)
	contentSecurityPolicy,
	pathTraversal, // Blocks path-traversal attempts and malformed URLs
	// CORS (Cross Origin Resource Sharing): Protects our users' sensitive data from other sites stealing it via cross-origin requests.
	// Access-Control-Allow-Origin (default '*'): which origins are allowed to READ our response body.
	// Access-Control-Allow-Credentials (default off): whether a cross-origin request that carried cookies is allowed to succeed/be read.
	// Turning it on (with a specific origin) could let another site read a logged-in user's private data — so we leave it off.
	cors(),
];

export default security;
