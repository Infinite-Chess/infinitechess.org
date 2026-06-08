// src/server/controllers/verifyAccountController.ts

/**
 * This controller supplies the inert verify landing page's state (`GET /verify/:token`) and
 * promotes a verified pending registration into a real member on a real button click
 * (`POST /verify/:token`).
 */

import type { Request, Response } from 'express';
import type { PendingRegistrationRecord } from '../database/pendingRegistrationManager.js';

import { promotePendingRegistration } from '../database/memberManager.js';
import { logEvents, logEventsAndPrint } from '../middleware/logEvents.js';
import { getPendingRegistrationByVerificationToken } from '../database/pendingRegistrationManager.js';

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
export function getVerifyPageState(req: Request): { state: 'prompt' | 'verified' | 'invalid' } {
	const token = req.params['token']!;

	const pending = getPendingRegistrationByVerificationToken(token);
	if (!isVerificationTokenLive(pending)) return { state: 'invalid' };
	// Live: a non-null member_user_id means it was already promoted; otherwise it still awaits the click.
	return { state: pending.member_user_id !== null ? 'verified' : 'prompt' };
}

/**
 * `POST /verify/:token` — promotes a verified pending registration into a real member.
 */
export function verifyPendingRegistration(req: Request, res: Response): void {
	// Express only matches this route with a non-empty :token segment.
	const token = req.params['token']!;

	let pending: PendingRegistrationRecord | undefined;
	try {
		pending = getPendingRegistrationByVerificationToken(token);
	} catch {
		// Allows a retry
		res.status(500).json({ message: 'A server error occurred. Please try again.' });
		return;
	}

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
	try {
		const user_id = promotePendingRegistration(pending);

		logEvents(`Created new member "${pending.username}" (ID ${user_id}).`, 'newMemberLog.txt');

		res.sendStatus(200);
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(
			`Error promoting pending registration "${pending.username}": ${message}`,
			'errLog.txt',
		);
		res.status(500).json({ message: 'A server error occurred. Please try again.' });
	}
}
