// src/server/middleware/middleware.ts

/**
 * Assembles the server's HTTP request pipeline, in order:
 * global middleware → cookie-setters → routers (`/webhooks`, `/` pages, `/api` endpoints)
 * → 404 → error handler.
 */

import type { Express } from 'express';

import i18next from 'i18next';
import { handle } from 'i18next-http-middleware';

import send404 from './send404.js';
import security from './security.js';
import apiRouter from '../routes/api.js';
import htmlCookies from './htmlCookies.js';
import staticAssets from './staticAssets.js';
import errorHandler from './errorHandler.js';
import { reqLogger } from './logEvents.js';
import { rateLimit } from './rateLimit.js';
import webhooksRouter from '../routes/webhooks.js';
import requestParsers from './requestParsers.js';
import { rootRouter } from '../routes/root.js';

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
	// Rate limit ALL incoming requests
	app.use(rateLimit);

	// Log every non-rate-limited incoming request, even those
	// with an unparseable body. Bodies are not logged.
	app.use(reqLogger);

	// Parse the request's JSON body and cookies into req.body / req.cookies.
	app.use(requestParsers);

	// Security stack: HTTPS enforcement, CSP headers, path-traversal blocking, and CORS.
	app.use(security);

	/** This sets req.i18n, and req.i18n.resolvedLanguage */
	app.use(handle(i18next, { removeLngFromUrl: false }));

	// Inbound third-party webhooks (e.g. AWS SES bounce/complaint/delivery notifications).
	app.use('/webhooks', webhooksRouter);

	// Serve static files: the built client bundle and the ACME challenge directory.
	app.use(staticAssets);
	// Set the per-HTML-request cookies (browser-id, preferences, checkmates_beaten).
	app.use(htmlCookies);

	// Serve the root HTML pages (SSR).
	app.use('/', rootRouter);

	// API router — every /api/* endpoint (each sub-router declares its own auth).
	app.use('/api', apiRouter);

	// Unknown route, send 404 error page.
	app.all('*', send404);

	// Error handling. Catches uncaught server errors.
	app.use(errorHandler);
}
