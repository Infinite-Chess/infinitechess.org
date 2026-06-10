// src/server/middleware/middleware.ts

/**
 * This module configures the middleware waterfall of our server
 */

import type { Express, Request, Response } from 'express';

import path from 'path';
import express from 'express';
import i18next from 'i18next';
import { handle } from 'i18next-http-middleware';
import cookieParser from 'cookie-parser';
import { fileURLToPath } from 'node:url';

import send404 from './send404.js';
import security from './security.js';
import errorHandler from './errorHandler.js';
import { reqLogger } from './logEvents.js';
import { verifyJWT } from './verifyJWT.js';
import { rateLimit } from './rateLimit.js';
import EditorSavesAPI from '../api/EditorSavesAPI.js';
import { rootRouter } from '../routes/root.js';
import { handleLogin } from '../controllers/loginController.js';
import { handleLogout } from '../controllers/logoutController.js';
import { removeAccount } from '../controllers/deleteAccountController.js';
import { processCommand } from '../api/AdminPanel.js';
import { getSeekPreview } from '../api/SeekPreviewAPI.js';
import { getContributors } from '../api/GitHub.js';
import { handleSesWebhook } from '../controllers/awsWebhook.js';
import { accessTokenIssuer } from '../controllers/authenticationTokens/accessTokenIssuer.js';
import { getLeaderboardData } from '../api/LeaderboardAPI.js';
import { handlePrepareRestart } from '../controllers/deployController.js';
import { assignOrRenewBrowserID } from '../controllers/browserIDManager.js';
import { verifyPendingRegistration } from '../controllers/verifyAccountController.js';
import { postPrefs, setPrefsCookie } from '../api/Prefs.js';
import { postCheckmateBeaten, setPracticeProgressCookie } from '../api/PracticeProgress.js';
import { getUnreadNewsCount, getUnreadNewsDatesEndpoint, markNewsAsRead } from '../api/NewsAPI.js';
import {
	handleForgotPasswordRequest,
	handleResetPassword,
} from '../controllers/passwordResetController.js';
import {
	checkUsernameAvailable,
	createNewMember,
	pollPendingRegistration,
	changePendingEmail,
} from '../controllers/createAccountController.js';
import {
	createAccountLimiter,
	createAccountAttemptLimiter,
	verificationEmailLimiter,
	forgotPasswordLimiter,
	editorSaveLimiter,
	editorLoadLimiter,
	seekPreviewLimiter,
	loginAttemptLimiter,
	usernameAvailabilityLimiter,
} from './rateLimiters.js';

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

	// This allows us to retrieve json-received-data as a parameter/data!
	// The logger can't log the request body without this.
	// This also ensures all requests with content-type "application/json" have a body as an object, even if empty.
	// Increased to 2mb to support large editor position saves (ICN data up to 1MB)
	app.use(express.json({ limit: '2mb' })); // Limit the size to avoid parsing excessively large objects. Beyond this should throw an error caught by our error handling middleware.

	app.use(reqLogger); // Log the request

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

	/**
	 * Allow processing urlencoded (FORM) data so that we can retrieve it as a parameter/variable.
	 * (e.g. when the content-type header is 'application/x-www-form-urlencoded')
	 */
	app.use(express.urlencoded({ limit: '10kb', extended: false })); // Limit the size to avoid parsing excessively large objects

	// Sets the req.cookies property
	app.use(cookieParser());

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

	// Root router
	app.use('/', rootRouter); // Contains every html page.

	// Account router
	app.get('/api/register/availability', usernameAvailabilityLimiter, checkUsernameAvailable); // Currently ONLY can check username
	app.post('/api/register', createAccountAttemptLimiter, createAccountLimiter, createNewMember);
	app.get('/api/register/awaiting/status', pollPendingRegistration);
	app.put('/api/register/awaiting/email', verificationEmailLimiter, changePendingEmail);

	// Member router
	app.delete('/api/members/:member', removeAccount);

	app.post('/api/reset-password', handleResetPassword);

	// API --------------------------------------------------------------------

	app.post('/api/auth', loginAttemptLimiter, handleLogin); // Login fetch POST request

	app.put('/api/language', (req: Request, res: Response) => {
		// Language cookie setter
		res.cookie('i18next', req.i18n.resolvedLanguage);
		res.send(''); // Doesn't work without this for some reason
	});

	app.get('/api/contributors', (_req: Request, res: Response) => {
		const contributors = getContributors();
		res.send(JSON.stringify(contributors));
	});

	app.get('/api/seek-preview/:seekId', seekPreviewLimiter, getSeekPreview);

	// Endpoint called by the GitHub Actions deploy workflow before pm2 reload
	app.post('/api/prepare-restart', handlePrepareRestart);

	app.post('/api/verify/:token', verifyPendingRegistration);

	app.post('/api/forgot-password', forgotPasswordLimiter, handleForgotPasswordRequest);

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

	app.post('/api/access-token', accessTokenIssuer);

	app.put('/api/preferences', postPrefs);

	app.put('/api/checkmates-progress', postCheckmateBeaten);

	// News routes
	app.get('/api/news/unread-count', getUnreadNewsCount);
	app.get('/api/news/unread-dates', getUnreadNewsDatesEndpoint);
	app.patch('/api/news/read', markNewsAsRead);

	// Editor saves routes
	app.get('/api/editor-saves', EditorSavesAPI.getSavedPositions);
	app.post('/api/editor-saves', editorSaveLimiter, EditorSavesAPI.savePosition);
	app.get('/api/editor-saves/:position_name', editorLoadLimiter, EditorSavesAPI.getPosition);
	app.delete('/api/editor-saves/:position_name', EditorSavesAPI.deletePosition);

	app.post('/api/logout', handleLogout);

	app.post('/api/admin/command', processCommand);

	// Leaderboard router
	app.get('/api/leaderboards/:leaderboard_id/top', getLeaderboardData);

	// Last Resort 404 and Error Handler ----------------------------------------------------

	// If we've reached this point, send our 404 page.
	app.all('*', send404);

	// Custom error handling. Comes after 404.
	app.use(errorHandler);
}
