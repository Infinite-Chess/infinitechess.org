
/**
 * This module configures the middleware waterfall of our server
 */

import express from 'express';
import path from 'path';
import cors from 'cors';

// Middleware
import cookieParser from 'cookie-parser';
import credentials from './credentials.js';
import secureRedirect from './secureRedirect.js';
import errorHandler from './errorHandler.js';
import { logger } from './logEvents.js';
import { verifyJWT } from './verifyJWT.js';
import { rateLimit } from './rateLimit.js';
import { protectedStatic } from './protectedStatic.js';

// External translation middleware
import i18next from 'i18next';
import middleware from 'i18next-http-middleware';

// Other imports
import { useOriginWhitelist } from '../config/config.js';
import { router as rootRouter } from '../routes/root.js';
import { router as accountRouter } from '../routes/createaccount.js';
import { router as memberRouter } from '../routes/member.js';
import send404 from './send404.js';
import corsOptions from '../config/corsOptions.js';

import { fileURLToPath } from 'node:url';
import { accessTokenIssuer } from '../database/controllers/accessTokenIssuer.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Configures the Middleware Waterfall
 * 
 * app.use adds the provided function to EVERY SINGLE router and incoming connection.
 * Each middleware function must call next() to go to the next middleware.
 * Connections that do not pass one middleware will not continue.
 * 
 * @param {object} app - The express application instance.
 */
function configureMiddleware(app) {

	// Note: requests that are rate limited will not be logged, to mitigate slow-down during a DDOS.
	app.use(rateLimit);

	// This allows us to retrieve json-received-data as a parameter/data!
	// The logger can't log the request body without this
	app.use(express.json());

	app.use(logger); // Log the request

	app.use(secureRedirect); // Redirects http to secure https

	app.use(credentials); // Handle credentials check. Must be before CORS.

	app.use(
		middleware.handle(i18next, {
			removeLngFromUrl: false
		})
	);

	/**
     * Cross Origin Resource Sharing
     * 
     * This allows 3rd party middleware. Without this, other sites will get an
     * error when retreiving data on your site to serve to their customers.
     * Be careful, incorrectly setting will block our own customers.
     * For many applications though, you don't want it open to the public,
     * but perhaps you do want search engines to have access?
     * 
     * Does this create a 'Access-Control-Allow-Origin' header?
     */
	const options = useOriginWhitelist ? corsOptions : undefined;
	app.use(cors(options));

	/**
     * Allow processing urlencoded (FORM) data so that we can retrieve it as a parameter/variable.
     * (e.g. when the content-type header is 'application/x-www-form-urlencoded')
     */
	app.use(express.urlencoded({ extended: false}));

	app.use(cookieParser());

	// Serve public assets. (e.g. css, scripts, images, audio)
	app.use(express.static(path.join(__dirname, '..', '..', '..', 'dist'))); // Serve public assets

	// Directory required for the ACME (Automatic Certificate Management Environment) protocol used by Certbot to validate your domain ownership.
	app.use('/.well-known/acme-challenge', express.static(path.join(__dirname, '../../../cert/.well-known/acme-challenge')));

	// Provide a route
	app.use('/', rootRouter);
	app.use('/createaccount(.html)?', accountRouter);
	app.use('/member', memberRouter);

	/**
     * Sets the req.user and req.role properties if they have an authorization
     * header (contains access token) or refresh cookie (contains refresh token).
     * Don't send unauthorized people private stuff without the proper role.
	 * 
	 * PLACE AS LOW AS YOU CAN, BUT ABOVE ALL ROUTES THAT NEED AUTHENTICATION!!
	 * This requires database requests.
     */
	app.use(verifyJWT);

	app.post("/api/get-access-token", accessTokenIssuer);

	// If we've reached this point, send our 404 page.
	app.all('*', send404);

	// Custom error handling. Comes after 404.
	app.use(errorHandler);
}

export default configureMiddleware;
