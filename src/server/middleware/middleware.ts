// src/server/middleware/middleware.ts

/**
 * Assembles the server's HTTP request pipeline, in order:
 * global middleware → cookie-setters → routers (`/webhooks`,
 * `/` pages, `/api` endpoints) → 404 → error handler.
 */

import type { Express } from 'express';

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
import { resolveLanguage } from './resolveLanguage.js';

// Functions -------------------------------------------------------------------------

/**
 * Assembles the request pipeline onto the app, in order.
 * @param app - The express application instance.
 */
export function configurePipeline(app: Express): void {
	// Rate limit ALL incoming requests
	app.use(rateLimit);

	// Log every non-rate-limited incoming request, even those
	// with an unparseable body. Bodies are not logged.
	app.use(reqLogger);

	// Security stack: HTTPS enforcement, CSP headers, path-traversal blocking, and CORS.
	app.use(security);

	// Parse the request's JSON body and cookies into req.body / req.cookies.
	app.use(requestParsers);

	// Resolve the language to serve (cookie → Accept-Language → default) into req.lang.
	app.use(resolveLanguage);

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
