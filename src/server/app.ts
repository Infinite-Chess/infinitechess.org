// src/server/app.ts

/**
 * Defines and configures the Express application instance.
 */

import express from 'express';

import { initTranslations } from './config/i18n.js';
import { configureNunjucks } from './config/nunjucks.js';
import { configureMiddleware } from './middleware/middleware.js';

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

configureMiddleware(app); // Setup the middleware waterfall

export default app;
