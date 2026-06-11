// src/server/middleware/middleware.ts

/**
 * Assembles the server's HTTP request pipeline, in order:
 * global middleware → cookie-setters → routers (`/` pages, `/api` endpoints)
 * → 404 → error handler.
 */

import type { Express } from 'express';

import path from 'path';
import express from 'express';
import i18next from 'i18next';
import { handle } from 'i18next-http-middleware';
import { fileURLToPath } from 'node:url';

import send404 from './send404.js';
import security from './security.js';
import apiRouter from '../routes/api.js';
import errorHandler from './errorHandler.js';
import { reqLogger } from './logEvents.js';
import { rateLimit } from './rateLimit.js';
import requestParsers from './requestParsers.js';
import { rootRouter } from '../routes/root.js';
import { setPrefsCookie } from '../api/Prefs.js';
import { handleSesWebhook } from '../controllers/awsWebhook.js';
import { assignOrRenewBrowserID } from '../controllers/browserIDManager.js';
import { setPracticeProgressCookie } from '../api/PracticeProgress.js';

// Constants -------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Functions -------------------------------------------------------------------------

/**
 * Configures the Middleware Waterfall
 *
 * app.use adds the provided function to EVERY SINGLE router and incoming connection.
 * Each middleware function must call next() to go to the next middleware.
 * Connections that do not pass one middleware will not continue.
 *
 * @param app - The express application instance.
 */
export function configureMiddleware(app: Express): void {
	// Note: requests that are rate limited will not be logged, to mitigate slow-down during a DDOS.
	app.use(rateLimit);

	// Log every incoming request, even those with an unparseable body. Bodies are not logged.
	app.use(reqLogger);

	// Parse the request's JSON body and cookies into req.body / req.cookies.
	app.use(requestParsers);

	// Security stack: HTTPS enforcement, CSP headers, path-traversal blocking, and CORS.
	app.use(security);

	/** This sets req.i18n, and req.i18n.resolvedLanguage */
	app.use(handle(i18next, { removeLngFromUrl: false }));

	// CUSTOM express.json() NEEDED because AWS SNS sends text/plain instead of application/json! But it is still parsable as JSON.
	const awsParser = express.json({
		limit: '50kb',
		type: ['text/plain', 'application/json'],
	});
	// Webhook endpoint for AWS Simple Email Service (SES) to notify us of bounces and complaints
	app.post('/webhooks/ses', awsParser, handleSesWebhook);

	// Serve public assets. (e.g. scripts, css, images, audio)
	app.use(
		express.static(path.join(__dirname, '../../client'), {
			setHeaders(res, filePath) {
				if (filePath.endsWith('.js') || filePath.endsWith('.css')) {
					// All JS and CSS files are content-hashed by esbuild (e.g. index-D3TD6A64.js).
					// The hash changes when content changes, so cached URLs never go stale.
					res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
				} else {
					// Other static assets (images, svgs, audio, fonts) are cached for 1 year
					// but not immutable — bump ?v=N in templates to bust the cache when they change.
					res.setHeader('Cache-Control', 'public, max-age=31536000');
				}
			},
		}),
	);

	// Every request beyond this point will not be for a resource like a script or image,
	// but it will be a request for an HTML or API

	// Directory required for the ACME (Automatic Certificate Management Environment) protocol used by Certbot to validate your domain ownership.
	app.use(
		'/.well-known/acme-challenge',
		express.static(path.join(__dirname, '../../../cert/.well-known/acme-challenge')),
	);

	// This sets the 'browser-id' cookie on every request for an HTML file
	app.use(assignOrRenewBrowserID);
	// This sets the user 'preferences' cookie on every request for an HTML file
	app.use(setPrefsCookie);
	// This sets the user 'checkmates_beaten' cookie on every request for an HTML file
	app.use(setPracticeProgressCookie);

	// Provide a route

	// Root router — every HTML (SSR) page.
	app.use('/', rootRouter);

	// API router — every /api/* endpoint (each sub-router declares its own auth).
	app.use('/api', apiRouter);

	// Last Resort 404 and Error Handler ----------------------------------------------------

	// If we've reached this point, send our 404 page.
	app.all('*', send404);

	// Custom error handling. Comes after 404.
	app.use(errorHandler);
}
