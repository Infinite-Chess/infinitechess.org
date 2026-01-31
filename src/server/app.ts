// src/server/app.ts

/**
 * Defines and configures the Express application instance.
 */

import express from 'express';
import ejs from 'ejs';

// @ts-ignore
import configureMiddleware from './middleware/middleware.js';
// @ts-ignore
import { initTranslations } from './config/setupTranslations.js';

const app = express();

// This ensures that req.ip will give us the real user's IP instead of the Cloudflare proxy's IP.
app.set('trust proxy', 1); // '1' means trust the first proxy hop (Cloudflare)
app.disable('x-powered-by'); // This removes the 'x-powered-by' header from all responses.

// Set EJS as the view engine
app.engine('html', ejs.renderFile);
app.set('view engine', 'html');

// This is in here so integration tests work, as they don't run server.js
initTranslations();

configureMiddleware(app); // Setup the middleware waterfall

export default app;
