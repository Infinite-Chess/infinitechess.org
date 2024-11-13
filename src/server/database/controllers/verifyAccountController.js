
import { logEvents } from "../../middleware/logEvents.js";
import { getTranslationForReq } from "../../utility/translate.js";
import { getMemberDataByCriteria, updateMemberColumns } from "./memberController.js";

// Called when clicked on verification link in email.
// CAN redirect!
const verifyAccount = async function(req, res) {
	// Get the parameters out of the url
	const claimedUsername = req.params.member;
	const claimedCode = req.params.code;

	// eslint-disable-next-line prefer-const
	let { user_id, username, verification } = getMemberDataByCriteria(['user_id', 'username', 'verification'], 'username', claimedUsername, { skipErrorLogging: true });
	if (user_id === undefined) { // User not found
		logEvents(`Invalid account verification link! User "${claimedUsername}" DOESN'T EXIST. Verification code "${claimedCode}"`, 'hackLog.txt', { print: true });
		return res.status(400).redirect(`/400`); // Bad request
	}
	// The verification is string fight in the database. We need to parse it here.
	verification = JSON.parse(verification);

	if (!req.memberInfo.signedIn) { // Not logged in
		logEvents(`Forwarding user '${username}' to login before they can verify!`, 'loginAttempts.txt', { print: true });
		// Redirect them to the login page, BUT add a query parameter with the original verification url they were visiting!
		const redirectTo = encodeURIComponent(req.originalUrl);
		return res.redirect(`/login?redirectTo=${redirectTo}`);
	}

	if (req.memberInfo.username !== username) { // Forbid them if they are logged in and NOT who they're wanting to verify!
		logEvents(`User "${req.memberInfo.username}" attempted to verify "${username}"!`, 'loginAttempts.txt', { print: true });
		return res.status(403).send(getTranslationForReq("server.javascript.ws-forbidden_wrong_account", req));
	}

	// verification: { verified, notified, code }

	// Ignore if already verified.
	if (verification === null || verification.verified === true) { // Bad request, member already verified
		logEvents(`Member "${username}" is already verified!`, 'loginAttempts.txt', { print: true });
		return res.redirect(`/member/${claimedUsername}`);
	}

	// Check if the verification code matches!
	if (claimedCode !== verification.code) {
		logEvents(`Invalid account verification link! User "${username}", code "${claimedCode}" INCORRECT`, 'loginAttempts.txt', { print: true });
		return res.status(400).redirect(`/400`);
	}

	// VERIFY THEM..
	onVerify(verification);

	// The next time they view their profile, a confirmation should be displayed that their account has been verified!

	const changesMade = updateMemberColumns(user_id, { verification });
	if (!changesMade) return logEvents(`No changes made when saving verification for member with id "${user_id}"! Value: ${JSON.stringify(verification)}`, 'errLog.txt', { print: true });

	logEvents(`Verified member ${username}'s account!`, 'loginAttempts.txt', { print: true });
	res.redirect(`/member/${username.toLowerCase()}`);
};

function onVerify(verification) { // { verified, notified, code }
	verification.verified = true;
	verification.notified = false;
	delete verification.code;
}

export { verifyAccount };