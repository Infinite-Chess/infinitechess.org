// src/server/controllers/browserIDManager.ts

import type { CookieOptions, Request, Response, NextFunction } from 'express';

import uuid from '../../shared/util/uuid.js';

import { isBrowserIDBanned } from '../middleware/banned.js';
import { logEventsAndPrint } from '../middleware/logEvents.js';

const expireOfBrowserIDCookieMillis = 1000 * 60 * 60 * 24 * 7; // 7 days

/** The options the `browser-id` cookie is created with. */
const BROWSER_ID_COOKIE_OPTIONS: CookieOptions = {
	// Readable by the server (including for websocket connections), NOT by client JavaScript.
	httpOnly: true,
	sameSite: 'lax',
	secure: true,
};

/** Sets the `browser-id` cookie to the given id, living for `maxAgeMillis` milliseconds. */
function setBrowserIDCookie(res: Response, id: string, maxAgeMillis: number): void {
	res.cookie('browser-id', id, { ...BROWSER_ID_COOKIE_OPTIONS, maxAge: maxAgeMillis });
}

/**
 * Assigns/renews the browser-id cookie to all requests for an html file.
 * If they have an existing browser id, it renews it for 7 more days.
 * If they don't, it gives them a new browser id for 7 day.
 * @param req - The Express request object.
 * @param res - The Express response object.
 * @param next - The Express next middleware function.
 */
function assignOrRenewBrowserID(req: Request, res: Response, next: NextFunction): void {
	// We don't have to worry about the request being for a resource because those have already been served.
	// The only scenario this request could be for now is an HTML or fetch API request.
	if (!req.accepts('html')) return next(); // Not an HTML request (but a fetch), don't set the cookie

	const cookies = req.cookies;
	if (!cookies['browser-id']) giveBrowserID(req, res);
	else refreshBrowserID(req, res);

	next();
}

function giveBrowserID(req: Request, res: Response): void {
	const id = uuid.generateID_Base62(6);

	// console.log(`Assigning new browser-id: "${id}" for url: ` + req.url + ' --------');

	setBrowserIDCookie(res, id, expireOfBrowserIDCookieMillis);
}

function refreshBrowserID(req: Request, res: Response): void {
	const id = req.cookies['browser-id']!;

	if (isBrowserIDBanned(id)) return makeBrowserIDPermanent(req, res, id);

	// console.log(`Renewing browser-id: "${id}" for url: ` + req.url);

	setBrowserIDCookie(res, id, expireOfBrowserIDCookieMillis);
}

function makeBrowserIDPermanent(req: Request, res: Response, browserID: string): void {
	setBrowserIDCookie(res, browserID, Number.MAX_SAFE_INTEGER /* FOREVER!! */);

	const logThis = `Making banned browser-id PERMANENT: ${browserID} !!! ${req.headers.origin}   ${req.method}   ${req.url}   ${req.headers['user-agent']}`;
	logEventsAndPrint(logThis, 'bannedIPLog.txt');
}

export { assignOrRenewBrowserID };
