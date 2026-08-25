// src/server/controllers/verifyAccountController.ts

/**
 * This controller supplies the inert verify landing page's state (`GET /verify/:token`) and
 * promotes a verified pending registration into a real member on a real button click
 * (`POST /api/verify/:token`).
 */

import type { Request, Response } from 'express';
import type { PendingRegistrationRecord } from '../database/pendingRegistrationManager.js';

import logEvents from '../utility/logEvents.js';
import memberManager from '../database/memberManager.js';
import pendingRegistrationManager from '../database/pendingRegistrationManager.js';

// Functions -------------------------------------------------------------------------

/**
 * Whether a verification token is still "live" — i.e. the verify button should do something.
 * True when the pending row exists and is either already promoted (idempotent re-verify) or not expired.
 */
function isVerificationTokenLive(
	pending: PendingRegistrationRecord | undefined,
): pending is PendingRegistrationRecord {
	return (
		pending !== undefined &&
		(pending.member_user_id !== null || pending.expires_at > Date.now())
	);
}

/**
 * Computes the render state for the inert `GET /verify/:token` landing page.
 * - `'prompt'` — a live, not-yet-verified token: the "Verify my account" button.
 * - `'verified'` — the row is already promoted: the "Account activated" confirmation.
 * - `'invalid'` — an unknown token, or one that expired.
 */
function getPageState(req: Request): { state: 'prompt' | 'verified' | 'invalid' } {
	const token = req.params['token']!;

	// Any db error here propagates to errorHandler which renders a 500 error page, intentional.
	const pending = pendingRegistrationManager.getByVerificationToken(token);
	if (!isVerificationTokenLive(pending)) return { state: 'invalid' };
	// Live: a non-null member_user_id means it was already promoted; otherwise it still awaits the click.
	return { state: pending.member_user_id !== null ? 'verified' : 'prompt' };
}

/** `POST /api/verify/:token` — promotes a verified pending registration into a real member. */
function verifyPendingRegistration(req: Request, res: Response): void {
	// Express only matches this route with a non-empty :token segment.
	const token = req.params['token']!;

	try {
		const pending = pendingRegistrationManager.getByVerificationToken(token);

		// Unknown token, or expired before it was ever promoted → dead link.
		if (!isVerificationTokenLive(pending)) {
			res.sendStatus(400);
			return;
		}

		// Already promoted → idempotent success (the member already exists).
		if (pending.member_user_id !== null) {
			res.sendStatus(200);
			return;
		}

		// Promote: actually create the member and mark the pending row verified.
		const user_id = memberManager.promote(pending);

		logEvents.add(`Created new member "${pending.username}" (ID ${user_id}).`, 'newMemberLog');

		res.sendStatus(200);
	} catch {
		// Allows a retry
		res.status(500).json({
			message: req.t.responses.errors.server_error,
		});
	}
}

// Exports -----------------------------------------------------------------------------------------

export default { getPageState, verifyPendingRegistration };
