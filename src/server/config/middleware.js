
/**
 * This module configures the middleware waterfall of our server
 */

import express from 'express';
import path from 'path';
import cors from 'cors';

// Middleware
import cookieParser from 'cookie-parser';
import credentials from '../middleware/credentials.js';
import secureRedirect from '../middleware/secureRedirect.js';
import { logger } from '../middleware/logEvents.js';
import { verifyJWT } from '../middleware/verifyJWT.js';
import { rateLimit } from '../middleware/rateLimit.js';

// External translation middleware
import i18next from 'i18next';
import middleware from 'i18next-http-middleware';

// Other imports
import { useOriginWhitelist } from './config.js';
import { router as rootRouter } from '../routes/root.js';
import send404 from '../middleware/send404.js';
import corsOptions from './corsOptions.js';

import { fileURLToPath } from 'node:url';
import { accessTokenIssuer } from '../controllers/authenticationTokens/accessTokenIssuer.js';
import { verifyAccount } from '../database/controllers/verifyAccountController.js';
import { requestConfirmEmail } from '../database/controllers/sendMail.js';
import { getMemberData } from '../api/Member.js';
import { handleLogout } from '../database/controllers/logoutController.js';
import { postPrefs, setPrefsCookie } from '../api/Prefs.js';
import { handleLogin } from '../database/controllers/authController.js';
import { checkEmailAssociated, checkUsernameAvailable, createNewMember } from '../database/controllers/createaccountController.js';
import { removeAccount } from '../database/controllers/removeAccountController.js';
import errorHandler from '../middleware/errorHandler.js';
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
	app.use(express.json({ limit: '10kb' })); // Limit the size to avoid parsing excessively large objects. Beyond this should throw an error caught by our error handling middleware.

	app.use(logger); // Log the request

	app.use(secureRedirect); // Redirects http to secure https

	app.use(credentials); // Handle credentials check. Must be before CORS.

	app.use(middleware.handle(i18next, { removeLngFromUrl: false }));

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
	app.use(express.urlencoded({ limit: '10kb', extended: false })); // Limit the size to avoid parsing excessively large objects

	// Sets the req.cookies property
	app.use(cookieParser());

	// Serve public assets. (e.g. css, scripts, images, audio)
	app.use(express.static(path.join(__dirname, '..', '..', '..', 'dist'))); // Serve public assets

	// Directory required for the ACME (Automatic Certificate Management Environment) protocol used by Certbot to validate your domain ownership.
	app.use('/.well-known/acme-challenge', express.static(path.join(__dirname, '../../../cert/.well-known/acme-challenge')));

	// This sets the user 'preferences' cookie on every request for an HTML file
	app.use(setPrefsCookie);

	// Provide a route

	// Root router
	app.use('/', rootRouter); // Contains every html page.

	// Account router
	app.post('/createaccount', createNewMember); // "/createaccount" POST request
	app.get('/createaccount/username/:username', checkUsernameAvailable);
	app.get('/createaccount/email/:email', checkEmailAssociated);

	// Member router
	app.delete('/member/:member/delete', removeAccount);


	// API --------------------------------------------------------------------

	app.post("/auth", handleLogin); // Login fetch POST request

	app.post("/setlanguage", (req, res) => { // Language cookie setter POST request
		res.cookie("i18next", req.i18n.resolvedLanguage);
		res.send(""); // Doesn't work without this for some reason
	});

	// Token Authenticator -------------------------------------------------------

	/**
     * Sets the req.memberInfo properties if they have an authorization
     * header (contains access token) or refresh cookie (contains refresh token).
     * Don't send unauthorized people private stuff without the proper role.
	 * 
	 * PLACE AS LOW AS YOU CAN, BUT ABOVE ALL ROUTES THAT NEED AUTHENTICATION!!
	 * This requires database requests.
     */
	app.use(verifyJWT);

	// ROUTES THAT NEED AUTHENTICATION ------------------------------------------------------

	app.post("/api/get-access-token", accessTokenIssuer);

	app.post('/api/set-preferences', postPrefs);

	app.get("/logout", handleLogout);

	// Member routes that do require authentication
	app.get('/member/:member/data', getMemberData);
	app.get('/member/:member/send-email', requestConfirmEmail);
	app.get("/verify/:member/:code", verifyAccount);

	// Last Resort 404 and Error Handler ----------------------------------------------------

	// If we've reached this point, send our 404 page.
	app.all('*', send404);

	// Custom error handling. Comes after 404.
	app.use(errorHandler);
}

export default configureMiddleware;
