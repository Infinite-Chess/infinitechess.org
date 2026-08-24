// src/server/app.ts

/**
 * Defines and configures the Express application instance, and assembles the
 * server's HTTP request pipeline, in order: global middleware → cookie-setters
 * → routers (`/webhooks`, `/` pages, `/api` endpoints) → 404 → error handler.
 */

import type { Express } from 'express';

import express from 'express';

import send404 from './middleware/send404.js';
import security from './middleware/security.js';
import apiRouter from './routes/api.js';
import rateLimit from './middleware/rateLimit.js';
import reqLogger from './utility/reqLogger.js';
import rootRouter from './routes/root.js';
import htmlCookies from './middleware/htmlCookies.js';
import reqLanguage from './config/reqLanguage.js';
import staticAssets from './middleware/staticAssets.js';
import errorHandler from './middleware/errorHandler.js';
import webhooksRouter from './routes/webhooks.js';
import requestParsers from './middleware/requestParsers.js';
import reqTranslations from './config/reqTranslations.js';
import htmlCacheControl from './middleware/htmlCacheControl.js';
import { assignRequestID } from './utility/requestContext.js';
import { initTranslations } from './config/i18n.js';
import { configureNunjucks } from './config/nunjucks.js';

/**
 * Assembles the request pipeline onto the app, in order.
 * @param app - The express application instance.
 */
function configurePipeline(app: Express): void {
	// Give every request a correlation ID that logEvents tags its log lines with.
	app.use(assignRequestID);

	// Log all incoming requests
	app.use(reqLogger.middleware);

	// Ensure every SSR HTML page is revalidated before reuse (never served stale).
	app.use(htmlCacheControl);

	// Rate limit all incoming requests
	app.use(rateLimit);

	// Security stack: HTTPS enforcement, CSP headers, path-traversal blocking, and CORS.
	app.use(security);

	// Parse the request's JSON body and cookies into req.body / req.cookies.
	app.use(requestParsers);

	// Inbound third-party webhooks (e.g. AWS SES bounce/complaint/delivery notifications).
	app.use('/webhooks', webhooksRouter);

	// Serve static files: the built client bundle.
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

const app = express();

// Trust 1 proxy hop (Cloudflare) so req.ip reflects the real client.
// This number must match the actual proxy count, AND all traffic
// must reach the origin only through Cloudflare. See utility/IP.ts.
app.set('trust proxy', 1);
app.disable('x-powered-by'); // This removes the 'x-powered-by' header from all responses.

// Configure Nunjucks as the view engine.
configureNunjucks(app);

// This is in here so integration tests work, as otherwise if
// this is in server.js, i18next is never initialized for tests.
initTranslations();

// Precompute language-resolution structures from the now-loaded supported-language set.
reqLanguage.init();

// Install the lazy `req.lang` (resolved language) and `req.t` (translations) getters on
// the request prototype, so server code can read either anywhere in the pipeline.
reqLanguage.install(app);
reqTranslations.install(app);

configurePipeline(app); // Assemble the request pipeline

export default app;
