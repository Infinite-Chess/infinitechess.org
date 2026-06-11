// src/server/middleware/htmlCookies.ts

/**
 * The per-HTML-request cookie-setters, applied as one unit in the middleware waterfall.
 * Each refreshes a cookie the client reads on every page load:
 *  - browser-id (anonymous device identifier),
 *  - preferences (the read side of user preferences — there is no GET /api/preferences), and
 *  - checkmates_beaten (practice progress).
 */

import type { Request, Response, NextFunction } from 'express';

import { setPrefsCookie } from '../api/Prefs.js';
import { assignOrRenewBrowserID } from '../controllers/browserIDManager.js';
import { setPracticeProgressCookie } from '../api/PracticeProgress.js';

/**
 * LEGACY: clears the old `i18next` language cookie, superseded by the `lang` cookie.
 * May remove this 1 year after the 2.0 website redesign update is released.
 */
function clearLegacyLangCookie(req: Request, res: Response, next: NextFunction): void {
	if (req.cookies['i18next'] !== undefined) res.clearCookie('i18next');
	next();
}

const htmlCookies = [
	assignOrRenewBrowserID, // Sets the 'browser-id' cookie
	setPrefsCookie, // Sets the user 'preferences' cookie
	setPracticeProgressCookie, // Sets the user 'checkmates_beaten' cookie
	clearLegacyLangCookie, // LEGACY: clears the old 'i18next' cookie
];

export default htmlCookies;
