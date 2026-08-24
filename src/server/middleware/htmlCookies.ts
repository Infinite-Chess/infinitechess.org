// src/server/middleware/htmlCookies.ts

/**
 * The per-HTML-request cookie-setters, applied as one unit in the middleware waterfall.
 * Each refreshes a cookie the client reads on every page load:
 *  - browser-id (anonymous device identifier),
 *  - preferences (the read side of user preferences — there is no GET /api/preferences), and
 *  - checkmates_beaten (practice progress).
 */

import type { Request, Response, NextFunction } from 'express';

import prefsCookie from '../controllers/prefsCookie.js';
import browserIDManager from './browserIDManager.js';
import practiceProgressCookie from '../controllers/practiceProgressCookie.js';

/** Refreshes every per-page-load cookie, skipping those only an HTML page has any use for. */
function htmlCookies(req: Request, res: Response, next: NextFunction): void {
	clearLegacyLangCookie(req, res);

	// Static assets are already served by this point, so a request that doesn't want HTML is a
	// fetch, which has no use for a cookie it never reads.
	//
	// Deliberately NOT the stricter `Sec-Fetch-Mode: navigate` test the error responders use:
	// browsers omitting that header would then never receive a browser-id, their websocket identity.
	if (req.accepts('html')) {
		browserIDManager.assignOrRenew(req, res);
		prefsCookie.set(req, res);
		practiceProgressCookie.set(req, res);
	}

	next();
}

/**
 * LEGACY: clears the old `i18next` language cookie, superseded by the `lang` cookie.
 * May remove this 1 year after the 2.0 website redesign update is released.
 */
function clearLegacyLangCookie(req: Request, res: Response): void {
	if (req.cookies['i18next'] !== undefined) res.clearCookie('i18next');
}

export default htmlCookies;
