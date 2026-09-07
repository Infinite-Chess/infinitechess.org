// src/server/controllers/logoutController.ts

/**
 * Ends a session: clears its cookies, deletes its refresh token, closes every socket it opened
 * — the asking tab's with a reason of its own, so its trip home isn't cut short — then redirects
 * home. A form navigation, not a fetch, so the browser may prompt before anything is sent.
 */

import type { Request, Response } from 'express';

import tabid from '../../shared/util/tabid.js';
import socketutil from '../../shared/util/socketutil.js';

import logEvents from '../utility/logEvents.js';
import sessionManager from '../auth/sessionManager.js';
import socketRegistry from '../socket/socketRegistry.js';
import refreshTokenManager from '../database/refreshTokenManager.js';

/**
 * `POST /api/logout` — revokes the caller's session, deletes its refresh token, closes its
 * sockets, then redirects home.
 */
async function handle(req: Request, res: Response): Promise<void> {
	// Always clear the client's session cookies, signed in or not.
	sessionManager.revoke(res);

	// Absent if our script hadn't yet added it to the form, or the caller isn't our page at all.
	const rawTabId = req.query[tabid.PARAM];
	const ourTabId = typeof rawTabId === 'string' ? rawTabId : undefined;

	const refreshToken = req.cookies['jwt'];
	if (refreshToken && typeof refreshToken === 'string') {
		// string, and not empty
		try {
			// Invalidate the token server-side.
			refreshTokenManager.remove(refreshToken);
		} catch {
			// DB error (already logged)
			res.sendStatus(500);
			return;
		}
		// Our own tab is already navigating home, so its sockets get a reason that tells it
		// to sit still. Reloading, as the others do, would cancel that navigation mid-flight.
		if (ourTabId !== undefined)
			socketRegistry.closeSocketsOfTab(refreshToken, ourTabId, 1008, socketutil.CLOSURE_REASONS.LOGGED_OUT_SELF); // prettier-ignore
		socketRegistry.closeOtherTabsOfSession(refreshToken, ourTabId, 1008, socketutil.CLOSURE_REASONS.LOGGED_OUT); // prettier-ignore
	}

	res.redirect(303, '/');

	logEvents.add(`Logged out a member.`, 'loginAttempts');
}

// Exports ---------------------------------------------------------------------

export default { handle };
