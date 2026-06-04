// src/server/controllers/verifyAccountController.ts

/**
 * This controller promotes a verified pending registration into a real member.
 */

import type { Request, Response } from 'express';

import { promotePendingRegistration } from '../database/memberManager.js';
import { logEvents, logEventsAndPrint } from '../middleware/logEvents.js';
import { getPendingRegistrationByVerificationToken } from '../database/pendingRegistrationManager.js';

// Functions -------------------------------------------------------------------------

/**
 * `POST /verify/:token` — promotes a verified pending registration into a real member.
 */
export function verifyPendingRegistration(req: Request, res: Response): void {
	// Express only matches this route with a non-empty :token segment.
	const token = req.params['token']!;

	const pending = getPendingRegistrationByVerificationToken(token);

	// Unknown token, or expired before it was ever promoted → dead link.
	if (
		pending === undefined ||
		(pending.member_user_id === null && pending.expires_at <= Date.now())
	) {
		res.status(400).json({
			verified: false,
			message: 'The verification link is invalid or has expired.',
		});
		return;
	}

	// Already promoted → idempotent success (the member already exists).
	if (pending.member_user_id !== null) {
		res.status(200).json({ verified: true });
		return;
	}

	// Promote: actually create the member and mark the pending row verified.
	try {
		const user_id = promotePendingRegistration(pending);

		logEvents(`Created new member "${pending.username}" (ID ${user_id}).`, 'newMemberLog.txt');

		res.status(200).json({ verified: true });
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(
			`Error promoting pending registration "${pending.username}": ${message}`,
			'errLog.txt',
		);
		res.status(500).json({
			verified: false,
			message: 'A server error occurred during verification.',
		});
	}
}
