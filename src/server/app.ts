// src/server/app.ts

/**
 * Defines and configures the Express application instance.
 */

import path from 'path';
import express from 'express';
import nunjucks from 'nunjucks';
import { fileURLToPath } from 'node:url';

import { initTranslations } from './config/i18n.js';
import { configureMiddleware } from './middleware/middleware.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

// This ensures that req.ip will give us the real user's IP instead of the Cloudflare proxy's IP.
app.set('trust proxy', 1); // '1' means trust the first proxy hop (Cloudflare)
app.disable('x-powered-by'); // This removes the 'x-powered-by' header from all responses.

// Configure Nunjucks as the view engine.
// Templates live in src/server/views/ and are copied to dist/server/views/ by the cpx
// build step alongside all other server files. This keeps src/client/ a clean
// "public browser assets only" tree with no server-side files mixed in.
// Root is dist/server/views/ so includes are absolute from that root:
//   {% extends "layout.njk" %}
//   {% include "components/header/header.njk" %}
nunjucks.configure(path.join(__dirname, 'views'), {
	autoescape: true,
	express: app,
	watch: process.env['NODE_ENV'] !== 'production', // Re-reads templates on change in dev mode
	throwOnUndefined: process.env['NODE_ENV'] !== 'production',
});
app.set('view engine', 'njk');

// This is in here so integration tests work, as otherwise if
// this is in server.js, i18next is never initialized for tests.
initTranslations();

configureMiddleware(app); // Setup the middleware waterfall

export default app;
