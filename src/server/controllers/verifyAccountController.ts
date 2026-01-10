// src/server/controllers/verifyAccountController.ts

/**
 * This controller handles verifying accounts, either manually or via an email link.
 */

// @ts-ignore
import { getTranslationForReq } from '../utility/translate.js';
import { AddVerificationToAllSocketsOfMember } from '../socket/socketManager.js';
import { logEventsAndPrint } from '../middleware/logEvents.js';
import { getMemberDataByCriteria, updateMemberColumns } from '../database/memberManager.js';

import type { Response } from 'express';
import type { IdentifiedRequest } from '../types.js';

// Functions -------------------------------------------------------------------------

/**
 * Route that verifies an account when the user clicks the link in the email.
 * If they are not signed in, this forwards them to the login page.
 */
export async function verifyAccount(req: IdentifiedRequest, res: Response): Promise<void> {
	if (!req.memberInfo) {
		logEventsAndPrint('req.memberInfo must be defined for verify account route!', 'errLog.txt');
		res.status(500).redirect('/500');
		return;
	}

	const claimedUsername = req.params['member']!;
	const claimedCode = req.params['code']!;

	const record = getMemberDataByCriteria(
		['user_id', 'username', 'is_verified', 'verification_code'],
		'username',
		claimedUsername,
	);

	if (record === undefined) {
		// User not found
		logEventsAndPrint(
			`Invalid account verification link! User "${claimedUsername}" DOESN'T EXIST. Verification code "${claimedCode}"`,
			'hackLog.txt',
		);
		res.status(400).redirect(`/400`); // Bad request
		return;
	}

	if (!req.memberInfo.signedIn) {
		// Not logged in
		logEventsAndPrint(
			`Forwarding user '${record.username}' to login before they can verify!`,
			'loginAttempts.txt',
		);
		// Redirect them to the login page, BUT add a query parameter with the original verification url they were visiting!
		const redirectTo = encodeURIComponent(req.originalUrl);
		res.redirect(`/login?redirectTo=${redirectTo}`);
		return;
	}

	if (req.memberInfo.username !== record.username) {
		// Forbid them if they are logged in and NOT who they're wanting to verify!
		logEventsAndPrint(
			`Member "${req.memberInfo.username}" of ID "${req.memberInfo.user_id}" attempted to verify member "${record.username}"!`,
			'loginAttempts.txt',
		);
		res.status(403).send(
			getTranslationForReq('server.javascript.ws-forbidden_wrong_account', req),
		);
		return;
	}

	// Ignore if already verified.
	if (record.is_verified === 1) {
		logEventsAndPrint(
			`Member "${record.username}" of ID ${record.user_id} is already verified!`,
			'loginAttempts.txt',
		);
		res.redirect(`/member/${record.username.toLowerCase()}`);
		return;
	}

	// Check if the verification code matches!
	if (claimedCode !== record.verification_code) {
		logEventsAndPrint(
			`Invalid account verification link! User "${record.username}", code "${claimedCode}" INCORRECT`,
			'loginAttempts.txt',
		);
		res.status(400).redirect(`/400`);
		return;
	}

	// VERIFY THEM..
	const result = _executeVerificationUpdate(record.user_id, record.username);

	if (result.success) {
		logEventsAndPrint(
			`Verified member ${record.username}'s account! ID ${record.user_id}`,
			'loginAttempts.txt',
		);
		res.redirect(`/member/${record.username.toLowerCase()}`);
	} else {
		logEventsAndPrint(
			`Verification failed for "${claimedUsername}" due to: ${result.reason}`,
			'errLog.txt',
		);
		res.status(500).redirect(`/member/${record.username.toLowerCase()}`);
	}
}

/**
 * Manually verifies a user by their email. DOES NOT CHECK PERMISSIONS.
 * @param email The email of the account to verify.
 * @returns A success or failure object.
 */
export function manuallyVerifyUser(
	email: string,
): { success: true; username: string } | { success: false; reason: string } {
	const record = getMemberDataByCriteria(['user_id', 'username', 'is_verified'], 'email', email);

	if (record === undefined)
		return { success: false, reason: `User with email "${email}" doesn't exist.` };
	if (record.is_verified === 1)
		return { success: false, reason: `User with email "${email}" is already verified.` };

	// VERIFY THEM..
	const result = _executeVerificationUpdate(record.user_id, record.username);

	if (result.success) {
		logEventsAndPrint(
			`Manually verified account of user with email "${email}"! ID ${record.user_id}`,
			'loginAttempts.txt',
		);
		return { success: true, username: record.username };
	} else {
		return { success: false, reason: result.reason };
	}
}

/**
 * Core logic to update the database to mark a user as verified.
 * @param user_id The ID of the user to verify.
 * @param username The username of the user to verify (for logging).
 * @returns A success or failure object.
 */
function _executeVerificationUpdate(
	user_id: number,
	username: string,
): { success: true } | { success: false; reason: string } {
	AddVerificationToAllSocketsOfMember(user_id);

	const changes = {
		is_verified: 1,
		verification_code: null,
		// Set to 0 so they will see the "Thank you" message next time they visit their profile
		is_verification_notified: 0,
	};
	const changesMade = updateMemberColumns(user_id, changes);

	if (!changesMade) {
		const reason = `Database update failed for user "${username}".`;
		logEventsAndPrint(
			`No changes made when verifying member "${username}" (ID: ${user_id})!`,
			'errLog.txt',
		);
		return { success: false, reason };
	}

	return { success: true };
}
