// src/server/middleware/secureRedirect.ts

/**
 * Redirects every http request to https, and sets HSTS on every response.
 */

import type { Request, Response, NextFunction } from 'express';

import 'dotenv/config'; // Imports all properties of process.env, if it exists

function secureRedirect(req: Request, res: Response, next: NextFunction): void {
	// 1-year is minimum remember time with preload parameter. Preload means google will always pre-tell clickers-of-your-site to connect via https.
	res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');

	if (req.secure) return next();

	// Force redirect to https...

	const httpsPort =
		process.env['NODE_ENV'] !== 'production'
			? ':' + (process.env['HTTPSPORT_LOCAL'] || '3443')
			: '';
	res.redirect(`https://${req.hostname}${httpsPort}${req.url}`);
}

export default secureRedirect;
