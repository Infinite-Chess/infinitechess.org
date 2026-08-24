// src/server/middleware/browserIDManager.ts

/**
 * Owns the 'browser-id' cookie: the anonymous per-device identifier handed to every
 * visitor, required before a websocket connection is accepted (it's the guest identity).
 *
 * On every HTML request it assigns a fresh id on first visit, or renews the expiry of
 * the existing one. If an id is on the ban list, its expiry is made permanent so the
 * ban can't be out-waited by simply not visiting for a while.
 */

import type { CookieOptions, Request, Response, NextFunction } from 'express';

import crypto from 'crypto';

import banned from './banned.js';
import { logEventsAndPrint } from '../utility/logEvents.js';

// Constants ----------------------------------------------------------------------------------

/** How long a browser-id lives before it must be renewed by another visit. */
const LIFETIME_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

/** The options the `browser-id` cookie is created with. */
const COOKIE_OPTIONS: CookieOptions = {
	// Readable by the server (including for websocket connections), NOT by client JavaScript.
	httpOnly: true,
	sameSite: 'lax',
	secure: true,
};

// Functions ----------------------------------------------------------------------------------

/** Sets the `browser-id` cookie to the given id, living for `maxAgeMillis` milliseconds. */
function setCookie(res: Response, id: string, maxAgeMillis: number): void {
	res.cookie('browser-id', id, { ...COOKIE_OPTIONS, maxAge: maxAgeMillis });
}

/**
 * Assigns/renews the browser-id cookie to all requests for an html file.
 * If they have an existing browser id, it renews it for 7 more days.
 * If they don't, it gives them a new browser id for 7 day.
 */
function assignOrRenew(req: Request, res: Response, next: NextFunction): void {
	// We don't have to worry about the request being for a resource because those have already been served.
	// The only scenario this request could be for now is an HTML or fetch API request.
	if (!req.accepts('html')) return next(); // Not an HTML request (but a fetch), don't set the cookie

	const cookies = req.cookies;
	if (!cookies['browser-id']) assignNew(res);
	else renew(req, res);

	next();
}

/** Assigns a fresh browser-id cookie. */
function assignNew(res: Response): void {
	// Browser ids are the sole identity credential for signed-out users (guests
	// in live games), so they should be unguessable. Use 'crypto' insteadof uuid.ts.
	const id = crypto.randomBytes(16).toString('base64url');

	setCookie(res, id, LIFETIME_MS);
}

/** Renews an existing browser-id's cookie lifetime; makes it permanent if it's banned. */
function renew(req: Request, res: Response): void {
	const id = req.cookies['browser-id']!;

	if (banned.isBrowserID(id)) return makePermanent(req, res, id);

	setCookie(res, id, LIFETIME_MS);
}

/** Makes a banned browser-id's cookie permanent, so the ban survives any absence. */
function makePermanent(req: Request, res: Response, browserID: string): void {
	setCookie(res, browserID, Number.MAX_SAFE_INTEGER /* FOREVER!! */);

	const logThis = `Making banned browser-id PERMANENT: ${browserID} !!! ${req.headers.origin}   ${req.method}   ${req.url}   ${req.headers['user-agent']!}`;
	logEventsAndPrint(logThis, 'bannedIPLog');
}

export default { assignOrRenew };
