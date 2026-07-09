// src/server/middleware/secureRedirect.ts

import type { Request, Response, NextFunction } from 'express';

import 'dotenv/config'; // Imports all properties of process.env, if it exists

/**
 * Middleware that redirects all http requests to https
 * @param req - The request object
 * @param res - The response object
 * @param next - The function to call, when finished, to continue the middleware waterfall.
 */
const secureRedirect = (req: Request, res: Response, next: NextFunction): void => {
	// 1-year is minimum remember time with preload parameter. Preload means google will always pre-tell clickers-of-your-site to connect via https.
	// Production-only: HSTS on localhost would pin the browser to https and break plain-http dev access.
	if (process.env['NODE_ENV'] === 'production')
		res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');

	if (req.secure) return next();

	// Dev-only: allow plain-HTTP localhost (browsers treat localhost as a secure context,
	// so everything incl. SharedArrayBuffer works) — avoids the self-signed-cert interstitial.
	if (process.env['NODE_ENV'] !== 'production' && ['localhost', '127.0.0.1'].includes(req.hostname)) return next(); // prettier-ignore

	// Force redirect to https...

	const httpsPort =
		process.env['NODE_ENV'] !== 'production'
			? ':' + (process.env['HTTPSPORT_LOCAL'] || '3443')
			: '';
	res.redirect(`https://${req.hostname}${httpsPort}${req.url}`);
};

export default secureRedirect;
