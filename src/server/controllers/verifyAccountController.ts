
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

	// eslint-disable-next-line prefer-const
	let { user_id, username, verification } = getMemberDataByCriteria(['user_id', 'username', 'verification'], 'username', claimedUsername, { skipErrorLogging: true }) as {
		user_id: number,
		username: string,
		verification: string | null,
	} | {
		user_id: undefined,
		username: undefined,
		verification: undefined,
	};
	if (user_id === undefined) { // User not found
		logEventsAndPrint(`Invalid account verification link! User "${claimedUsername}" DOESN'T EXIST. Verification code "${claimedCode}"`, 'hackLog.txt');
		return res.status(400).redirect(`/400`); // Bad request
	}

	let verificationJS: Verification | null;
	try {
		// The verification data is stored as a JSON string
		verificationJS = verification === null ? null : JSON.parse(verification!);
	} catch (e) {
		logEventsAndPrint(`Failed to parse verification JSON for user_id (${user_id}) while verifying account. The stringified json: ${verification}`, 'errLog.txt');
		return;
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

	// verification: { verified (boolean), notified (boolean), code (string) }

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
	verificationJS = getNewVerificationAfterVerifying();

	// Informs all sockets of the user that he is now verified
	AddVerificationToAllSocketsOfMember(user_id);

	// The next time they view their profile, a confirmation should be displayed that their account has been verified!

	const changesMade = updateMemberColumns(user_id, { verification: verificationJS });
	if (!changesMade) return logEventsAndPrint(`No changes made when saving verification for member "${username}" of id "${user_id}"! Value: ${JSON.stringify(verificationJS)}`, 'errLog.txt');

	logEventsAndPrint(`Verified member ${username}'s account! ID ${user_id}`, 'loginAttempts.txt');
	res.redirect(`/member/${username.toLowerCase()}`);
};

/**
 * Returns the verification object that it should look like
 * right after verifying and before we've notified them
 * that they've been verified on their profile page.
 */
function getNewVerificationAfterVerifying(): Verification { // { verified, notified, code }
	return {
		verified: true,
		notified: false,
	};
}

/**
 * Manually verifies a user by the provided name.
 * 
 * DOES NOT CHECK IF YOU HAVE THE REQUIRED PERMISSIONS.
 * @param usernameCaseInsensitive 
 * @returns A success object: `{ success (boolean}, reason (string, if failed) }`
 */
function manuallyVerifyUser(usernameCaseInsensitive: string): { success: true, username: string } | { success: false, reason: string } {
	const { user_id, username, verification } = getMemberDataByCriteria(['user_id', 'username', 'verification'], 'username', usernameCaseInsensitive, { skipErrorLogging: true }) as {
		user_id: number,
		username: string,
		verification: string | null,
	} | {
		user_id: undefined,
		username: undefined,
		verification: undefined,
	};
	if (user_id === undefined) { // User not found
		logEventsAndPrint(`Cannot manually verify user "${usernameCaseInsensitive}" when they don't exist.`, 'errLog.txt');
		return { success: false, reason: `User "${usernameCaseInsensitive}" doesn't exist.` };
	}

	let verificationJS: Verification | null;
	try {
		// The verification data is stored as a JSON string
		verificationJS = verification === null ? null : JSON.parse(verification!);
	} catch (e) {
		logEventsAndPrint(`Failed to parse verification JSON for user_id (${user_id}) while verifying account. The stringified json: ${verification}`, 'errLog.txt');
		return { success: false, reason: `Failed to parse verification data for user "${username}".` };
	}
	
	if (verificationJS === null || verificationJS.verified) { // Already verified and notified
		logEventsAndPrint(`Cannot manually verify user "${username}" when they are already verified.`, 'errLog.txt');
		return { success: false, reason: `User "${username}" is already verified.` };
	}

	// VERIFY THEM..
	verificationJS = getNewVerificationAfterVerifying();

	// Informs all sockets of the user that he is now verified
	AddVerificationToAllSocketsOfMember(user_id);

	// The next time they view their profile, a confirmation should be displayed that their account has been verified!

	const changesMade = updateMemberColumns(user_id, { verification: verificationJS });
	if (!changesMade) {
		logEventsAndPrint(`No changes made when manually verifying member "${username}" of id "${user_id}"! Value: ${JSON.stringify(verificationJS)}`, 'errLog.txt');
		return { success: false, reason: `No changes made for user "${username}".`};
	}

	logEventsAndPrint(`Manually verified member ${username}'s account! ID ${user_id}`, 'loginAttempts.txt');
	return { success: true, username };
}


export {
	Verification,
	verifyAccount,
	manuallyVerifyUser,
};