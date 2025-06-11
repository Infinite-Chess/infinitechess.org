
// src/server/controllers/verifyAccountController.ts

/**
 * The function handles verifying accounts,
 * either manually,
 * or when they click the verification link in the email
 * they get after they create their account.
 */

import { AddVerificationToAllSocketsOfMember } from "../socket/socketManager.js";
import { logEventsAndPrint } from "../middleware/logEvents.js";
// @ts-ignore
import { getTranslationForReq } from "../utility/translate.js";
// @ts-ignore
import { getMemberDataByCriteria, updateMemberColumns } from "../database/memberManager.js";


// Type Definitions ----------------------------------------------------------------


import type { Response } from 'express';
import type { AuthenticatedRequest } from "../../types.js";

/**
 * The verification object that gets stored in
 * the verification column of the members table
 */
type Verification = {
	/** Whether or not they are verified */
	verified: false,
	code: string,
} | {
	/** Whether or not they are verified */
	verified: true,
	/**
	 * Whether or not they have been notified AFTER being verified.
	 * Only present if they have been verified.
	 * */
	notified: false,
}

// A specific type for the return value of getMemberDataByCriteria for this module
type MemberVerificationData = {
	user_id: number,
	username: string,
	verification: string | null,
} | {
	user_id: undefined,
	username: undefined,
	verification: undefined,
};


// Functions -------------------------------------------------------------------------



/**
 * Route that verifies accounts when they click the link in the email.
 * If they are not signed in, this forwards them to the login page.
 */
async function verifyAccount(req: AuthenticatedRequest, res: Response) {
	if (!req.memberInfo) {
		logEventsAndPrint("req.memberInfo must be defined for verify account route!", 'errLog.txt');
		return res.status(500).redirect('/500');
	}

	// Get the parameters out of the url
	const claimedUsername = req.params['member'];
	const claimedCode = req.params['code'];

	const { user_id, username, verification } = getMemberDataByCriteria(['user_id', 'username', 'verification'], 'username', claimedUsername, { skipErrorLogging: true }) as MemberVerificationData;
	
	if (user_id === undefined) { // User not found
		logEventsAndPrint(`Invalid account verification link! User "${claimedUsername}" DOESN'T EXIST. Verification code "${claimedCode}"`, 'hackLog.txt');
		return res.status(400).redirect(`/400`); // Bad request
	}

	let verificationJS: Verification | null;
	try {
		// The verification data is stored as a JSON string
		verificationJS = verification ? JSON.parse(verification) : null;
	} catch (e) {
		logEventsAndPrint(`Failed to parse verification JSON for user_id (${user_id}) in verifyAccount route. The stringified json: ${verification}`, 'errLog.txt');
		return res.status(500).redirect('/500'); // Internal Server Error
	}

	if (!req.memberInfo.signedIn) { // Not logged in
		logEventsAndPrint(`Forwarding user '${username}' to login before they can verify!`, 'loginAttempts.txt');
		// Redirect them to the login page, BUT add a query parameter with the original verification url they were visiting!
		const redirectTo = encodeURIComponent(req.originalUrl);
		return res.redirect(`/login?redirectTo=${redirectTo}`);
	}

	if (req.memberInfo.username !== username) { // Forbid them if they are logged in and NOT who they're wanting to verify!
		logEventsAndPrint(`Member "${req.memberInfo.username}" of ID "${req.memberInfo.user_id}" attempted to verify member "${username}"!`, 'loginAttempts.txt');
		return res.status(403).send(getTranslationForReq("server.javascript.ws-forbidden_wrong_account", req));
	}
	
	// Ignore if already verified.
	if (verificationJS === null || verificationJS.verified) { // Bad request, member already verified
		logEventsAndPrint(`Member "${username}" of ID ${user_id} is already verified!`, 'loginAttempts.txt');
		return res.redirect(`/member/${username}`);
	}

	// Check if the verification code matches!
	if (claimedCode !== verificationJS.code) {
		logEventsAndPrint(`Invalid account verification link! User "${username}", code "${claimedCode}" INCORRECT`, 'loginAttempts.txt');
		return res.status(400).redirect(`/400`);
	}
	
	// VERIFY THEM..
	const result = _executeVerificationUpdate(user_id, username);

	if (result.success) {
		logEventsAndPrint(`Verified member ${username}'s account! ID ${user_id}`, 'loginAttempts.txt');
		res.redirect(`/member/${username.toLowerCase()}`);
	} else {
		logEventsAndPrint(`Verification failed for "${claimedUsername}" due to: ${result.reason}`, 'errLog.txt');
		res.status(500).redirect(`/member/${username.toLowerCase()}`);
	}
}

/**
 * Manually verifies a user by the provided name.
 * 
 * DOES NOT CHECK IF YOU HAVE THE REQUIRED PERMISSIONS.
 * @param usernameCaseInsensitive 
 * @returns A success object: `{ success (boolean}, reason (string, if failed) }`
 */
function manuallyVerifyUser(usernameCaseInsensitive: string): { success: true, username: string } | { success: false, reason: string } {
	const { user_id, username, verification } = getMemberDataByCriteria(['user_id', 'username', 'verification'], 'username', usernameCaseInsensitive, { skipErrorLogging: true }) as MemberVerificationData;
	
	if (user_id === undefined) { // User not found
		logEventsAndPrint(`Cannot manually verify user "${usernameCaseInsensitive}" when they don't exist.`, 'errLog.txt');
		return { success: false, reason: `User "${usernameCaseInsensitive}" doesn't exist.` };
	}

	let verificationJS: Verification | null;
	try {
		// The verification data is stored as a JSON string
		verificationJS = verification ? JSON.parse(verification) : null;
	} catch (e) {
		logEventsAndPrint(`Failed to parse verification JSON for user_id (${user_id}) while verifying account. The stringified json: ${verification}`, 'errLog.txt');
		return { success: false, reason: `Failed to parse verification data for user "${username}".` };
	}
	
	if (verificationJS === null || verificationJS.verified) { // Already verified
		logEventsAndPrint(`Cannot manually verify user "${username}" when they are already verified.`, 'errLog.txt');
		return { success: false, reason: `User "${username}" is already verified.` };
	}

	// VERIFY THEM..
	const result = _executeVerificationUpdate(user_id, username);

	if (result.success) {
		logEventsAndPrint(`Manually verified member ${username}'s account! ID ${user_id}`, 'loginAttempts.txt');
		return { success: true, username };
	} else {
		logEventsAndPrint(`Manual verification failed for "${usernameCaseInsensitive}": ${result.reason}`, 'errLog.txt');
		return { success: false, reason: result.reason };
	}
}

/**
 * Core logic to perform the verification update in the database.
 * This function now expects the user's ID and performs the update without re-fetching data.
 * @param user_id The ID of the user to verify.
 * @param username The username of the user to verify (for logging).
 * @returns A success or failure object.
 */
function _executeVerificationUpdate(user_id: number, username: string): { success: true } | { success: false, reason: string } {
	// Informs all sockets of the user that he is now verified
	AddVerificationToAllSocketsOfMember(user_id);

	const newVerificationState = { verified: true, notified: false };
	const changesMade = updateMemberColumns(user_id, { verification: newVerificationState });
	
	if (!changesMade) {
		const reason = `Database update failed for user "${username}".`;
		logEventsAndPrint(`No changes made when saving verification for member "${username}" of id "${user_id}"! Value: ${JSON.stringify(newVerificationState)}`, 'errLog.txt');
		return { success: false, reason };
	}
	
	// The next time they view their profile, a confirmation should be displayed that their account has been verified!
	return { success: true };
}


export {
	Verification,
	verifyAccount,
	manuallyVerifyUser,
};