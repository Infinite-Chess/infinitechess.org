/**
 * This module handles account deletion.
 */

import { logEvents } from "../../middleware/logEvents";
import { getTranslationForReq } from "../../utility/translate";
import { testPasswordForRequest } from "./authController";
import { deleteUser, getMemberDataByCriteria } from "./memberController";

// Automatic deletion of accounts...

/** The maximum time an account is allowed to remain unverified before the server will delete it from DataBase. */
const maxExistenceTimeForUnverifiedAccountMillis = 1000 * 60 * 60 * 24 * 3; // 3 days
/** The interval for how frequent to check for unverified account that exists more than `maxExistenceTimeForUnverifiedAccount` */
const intervalForRemovalOfOldUnverifiedAccountsMillis = 1000 * 60 * 60 * 24 * 1; // 1 days



/**
 * Route that removes a user account if they request to delete it.
 * @param {object} req - The request object.
 * @param {object} res - The response object.
 */
async function removeAccount(req, res) {
	const claimedUsername = req.params.member;

	// The delete account request doesn't come with the username
	// already in the body, so we set that here.
	req.body.username = claimedUsername;
	if (!(await testPasswordForRequest(req, res))) { // It will have already sent a response
		return logEvents(`Incorrect password for user "${claimedUsername}" attempting to remove account!`, "loginAttempts.txt", { print: true });
	}

	// DELETE ACCOUNT..

	console.error("Don't know how to delete all roles of mem yet");
	// removeAllRoles(claimedUsername); // Remove roles

	const { user_id } = getMemberDataByCriteria(['user_id'], 'username', claimedUsername);
	if (user_id === undefined) {
		logEvents(`Unable to find member of claimed username "${claimedUsername}" after a successful`)
		// if (user_id === undefined) return logEvents(`User "${usernameCaseInsensitive}" not found after a successful login! This should never happen.`, 'errLog.txt', { print: true });
	}

	deleteUser(user_id);

	if (deleteUser(claimedUsername)) {
		logEvents(`User ${claimedUsername} deleted their account.`, "deletedAccounts.txt", { print: true });
		return res.send('OK'); // 200 is default code
	} else {
		logEvents(`Can't delete ${claimedUsername}'s account. They do not exist.`, 'hackLog.txt', { print: true });
		return res.status(404).json({ 'message' : getTranslationForReq("server.javascript.ws-deleting_account_not_found", req) });
	}
}

/**
 * Remove a user account by username.
 * @param {string} usernameLowercase - The username of the account to remove, in lowercase.
 * @param {string} reason - The reason for account deletion.
 */
function removeAccountByUsername(usernameLowercase, reason) {
	removeAllRoles(usernameLowercase);
	if (removeMember(usernameLowercase)) {
		logEvents(`User ${usernameLowercase} was deleted for '${reason}'`, "deletedAccounts.txt", { print: true });
	} else {
		logEvents(`User ${usernameLowercase} was attempted to be removed for '${reason}' but failed`, 'hackLog.txt', { print: true });
	}
}

// Automatic deletion of old, unverified accounts...

/**
 * This function is run every {@link intervalForRemovalOfOldUnverifiedAccountsMillis}.
 * It checkes for old unverified account and removes them from the database
 */
function removeOldUnverifiedMembers() {
	const now = new Date();
	const millisecondsInADay = 1000 * 60 * 60 * 24;

	const allUserNames = getAllUsernames(); // An array of all usernames

	for (const username of allUserNames) {
		if (getVerified(username) !== false) continue; // Are verified, or they don't exist
		// Are not verified...
        
		// Calculate the time since the user joined
		const timeJoined = getJoinDate(username); // A date object
		const timeSinceJoined = now - timeJoined; // Milliseconds (Date - Date = number)

		if (timeSinceJoined < maxExistenceTimeForUnverifiedAccountMillis) continue; // Account isn't old enough.

		// Delete account...
		removeAccountByUsername(username, `Unverified for more than ${maxExistenceTimeForUnverifiedAccountMillis / millisecondsInADay} days`);
	}
}

removeOldUnverifiedMembers(); // Call once on startup.
setInterval(removeOldUnverifiedMembers, intervalForRemovalOfOldUnverifiedAccountsMillis); // Repeatedly call once a day


export {
	removeAccount,
	removeAccountByUsername
};