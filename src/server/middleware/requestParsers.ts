// src/server/middleware/requestParsers.ts

/**
 * The ordered request parsers, applied as one unit by the middleware waterfall.
 * Populate req.body (JSON) and req.cookies so downstream handlers can read them.
 * The JSON size limit throws a 400/413/415 error, caught by our error handling middleware.
 */

import express from 'express';
import cookieParser from 'cookie-parser';

const requestParsers = [
	// Parse application/json bodies. Also ensures every
	// application/json request has a body object, even if empty.
	// 2mb limit supports large editor position saves (ICN data up to 1MB).
	express.json({ limit: '2mb' }),
	// Parse the Cookie header into req.cookies.
	cookieParser(),
];

export default requestParsers;
