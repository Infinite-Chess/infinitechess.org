// src/server/middleware/htmlCookies.ts

/**
 * The per-HTML-request cookie-setters, applied as one unit in the middleware waterfall.
 * Each refreshes a cookie the client reads on every page load:
 *  - browser-id (anonymous device identifier),
 *  - preferences (the read side of user preferences — there is no GET /api/preferences), and
 *  - checkmates_beaten (practice progress).
 */

import { setPrefsCookie } from '../api/Prefs.js';
import { assignOrRenewBrowserID } from '../controllers/browserIDManager.js';
import { setPracticeProgressCookie } from '../api/PracticeProgress.js';

const htmlCookies = [
	assignOrRenewBrowserID, // Sets the 'browser-id' cookie
	setPrefsCookie, // Sets the user 'preferences' cookie
	setPracticeProgressCookie, // Sets the user 'checkmates_beaten' cookie
];

export default htmlCookies;
