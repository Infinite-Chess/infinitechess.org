// src/server/cookies/browserIDCookie.ts

/**
 * Owns the 'browser-id' cookie: the anonymous per-device identifier handed to every
 * visitor, required before a websocket connection is accepted (it's the guest identity).
 *
 * On every HTML request it assigns a fresh id on first visit, or renews the expiry of
 * the existing one. If an id is on the ban list, its expiry is made permanent so the
 * ban can't be out-waited by simply not visiting for a while.
 */

import type { CookieOptions, Request, Response } from 'express';

import crypto from 'crypto';

import banned from '../database/banned.js';
import logEvents from '../utility/logEvents.js';

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

/** Assigns the browser-id cookie if they have none, otherwise renews the existing one for 7 more days. */
function assignOrRenew(req: Request, res: Response): void {
	if (!req.cookies['browser-id']) assignNew(res);
	else renew(req, res);
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
	logEvents.addAndPrint(logThis, 'bannedIPLog');
}

export default { assignOrRenew };
