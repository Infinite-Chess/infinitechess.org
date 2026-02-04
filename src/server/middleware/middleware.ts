// src/server/middleware/middleware.ts

/**
 * This module configures the middleware waterfall of our server
 */

import type { Express, Request, Response, NextFunction } from 'express';

import path from 'path';
import cors from 'cors';
import helmet from 'helmet';
import express from 'express';
import i18next from 'i18next';
import cookieParser from 'cookie-parser';
import { handle } from 'i18next-http-middleware';
import { fileURLToPath } from 'node:url';

import send404 from './send404.js';
import errorHandler from './errorHandler.js';
import EditorSavesAPI from '../api/EditorSavesAPI.js';
import secureRedirect from './secureRedirect.js';
import { reqLogger } from './logEvents.js';
import { verifyJWT } from './verifyJWT.js';
import { rateLimit } from './rateLimit.js';
import { rootRouter } from '../routes/root.js';
import { handleLogin } from '../controllers/loginController.js';
import { handleLogout } from '../controllers/logoutController.js';
import { verifyAccount } from '../controllers/verifyAccountController.js';
import { getMemberData } from '../api/MemberAPI.js';
import { removeAccount } from '../controllers/deleteAccountController.js';
import { processCommand } from '../api/AdminPanel.js';
import { getContributors } from '../api/GitHub.js';
import { handleSesWebhook } from '../controllers/awsWebhook.js';
import { accessTokenIssuer } from '../controllers/authenticationTokens/accessTokenIssuer.js';
import { getLeaderboardData } from '../api/LeaderboardAPI.js';
import { requestConfirmEmail } from '../controllers/sendMail.js';
import { assignOrRenewBrowserID } from '../controllers/browserIDManager.js';
import { postPrefs, setPrefsCookie } from '../api/Prefs.js';
import { postCheckmateBeaten, setPracticeProgressCookie } from '../api/PracticeProgress.js';
import { getUnreadNewsCount, getUnreadNewsDatesEndpoint, markNewsAsRead } from '../api/NewsAPI.js';
import {
	handleForgotPasswordRequest,
	handleResetPassword,
} from '../controllers/passwordResetController.js';
import {
	checkEmailValidity,
	checkUsernameAvailable,
	createNewMember,
} from '../controllers/createAccountController.js';
import {
	createAccountLimiter,
	resendAccountVerificationLimiter,
	forgotPasswordLimiter,
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

	// Security Headers & HTTPS Enforcement
	app.use(secureRedirect); // Redirects http to secure https
	app.use(
		helmet({
			contentSecurityPolicy: {
				directives: {
					defaultSrc: ["'self'"],
					scriptSrc: ["'self'", "'unsafe-inline'", "'wasm-unsafe-eval'"], // Allows inline scripts
					scriptSrcAttr: ["'self'", "'unsafe-inline'"], // Allows inline event handlers
					objectSrc: ["'none'"],
					frameSrc: ["'self'", 'https://www.youtube.com'],
					imgSrc: ["'self'", 'data:', 'https://avatars.githubusercontent.com', 'blob:'],
				},
			},
		}),
	);

	// Path Traversal Protection, and error protection from malformed URLs
	app.use((req: Request, res: Response, next: NextFunction) => {
		try {
			const decoded = decodeURIComponent(req.url);

			// Check 1: Raw encoded patterns (before decoding)
			const encodedPatterns = /(%2e%2e|%252e|%%32%65)/gi;
			if (encodedPatterns.test(req.url)) {
				console.warn('Blocked traversal:', req.url);
				console.warn('Decoded URL:', decoded);
				res.status(403).send('Forbidden');
				return;
			}

			// Check 2: Decoded path segments
			const segments = decoded.split(/[\\/]/);
			if (segments.includes('..')) {
				// Console warn both the decoded and the original URL
				console.warn('Blocked traversal:', req.url);
				console.warn('Decoded URL:', decoded);
				res.status(403).send('Forbidden');
				return;
			}

			next();
		} catch (_err) {
			console.warn('Blocked invalid URL encoding:', req.url);
			res.status(400).send('Invalid URL encoding');
		}
	});

	/** This sets req.i18n, and req.i18n.resolvedLanguage */
	app.use(handle(i18next, { removeLngFromUrl: false }));

	app.use(cors());

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

	// Serve public assets. (e.g. css, scripts, images, audio)
	app.use(express.static(path.join(__dirname, '../../client'))); // Serve public assets

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
	app.post('/createaccount', createAccountLimiter, createNewMember); // "/createaccount" POST request
	app.get('/createaccount/username/:username', checkUsernameAvailable);
	app.get('/createaccount/email/:email', checkEmailValidity);

	// Member router
	app.delete('/member/:member/delete', removeAccount);

	app.post('/reset-password', handleResetPassword);

	// API --------------------------------------------------------------------

	app.post('/auth', handleLogin); // Login fetch POST request

	app.post('/setlanguage', (req: Request, res: Response) => {
		// Language cookie setter POST request
		res.cookie('i18next', req.i18n.resolvedLanguage);
		res.send(''); // Doesn't work without this for some reason
	});

	app.get('/api/contributors', (_req: Request, res: Response) => {
		const contributors = getContributors();
		res.send(JSON.stringify(contributors));
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

	app.post('/api/get-access-token', accessTokenIssuer);

	app.post('/api/set-preferences', postPrefs);

	app.post('/api/update-checkmatelist', postCheckmateBeaten);

	// News routes
	app.get('/api/news/unread-count', getUnreadNewsCount);
	app.get('/api/news/unread-dates', getUnreadNewsDatesEndpoint);
	app.post('/api/news/mark-read', markNewsAsRead);

	// Editor saves routes
	app.get('/api/editor-saves', EditorSavesAPI.getSavedPositions);
	app.post('/api/editor-saves', EditorSavesAPI.savePosition);
	app.get('/api/editor-saves/:position_name', EditorSavesAPI.getPosition);
	app.delete('/api/editor-saves/:position_name', EditorSavesAPI.deletePosition);

	app.get('/logout', handleLogout);

	app.get('/command/:command', processCommand);

	// Member routes that do require authentication
	app.get('/member/:member/data', getMemberData);
	app.post('/member/:member/send-email', resendAccountVerificationLimiter, requestConfirmEmail);
	app.get('/verify/:member/:code', verifyAccount);

	// Leaderboard router
	app.get(
		'/leaderboard/top/:leaderboard_id/:start_rank/:n_players/:find_requester_rank',
		getLeaderboardData,
	);

	app.post('/forgot-password', forgotPasswordLimiter, handleForgotPasswordRequest);

	// Last Resort 404 and Error Handler ----------------------------------------------------

	// If we've reached this point, send our 404 page.
	app.all('*', send404);

	// Custom error handling. Comes after 404.
	app.use(errorHandler);
}
