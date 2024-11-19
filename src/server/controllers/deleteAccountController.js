/**
 * This module handles account deletion.
 */

import db from '../database/database.js';
import { logEvents } from "../middleware/logEvents.js";
import { getTranslationForReq } from "../utility/translate.js";
import { deleteUser, getMemberDataByCriteria } from "../database/memberManager.js";
import { doStuffOnLogout } from '../controllers/logoutController.js';
import { testPasswordForRequest } from './authController.js';



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

	const { user_id, username } = getMemberDataByCriteria(['user_id', 'username'], 'username', claimedUsername);
	if (user_id === undefined) {
		return logEvents(`Unable to find member of claimed username "${claimedUsername}" after a correct password to delete their account!`, 'errLog.txt', { print: true });
		// if (user_id === undefined) return logEvents(`User "${usernameCaseInsensitive}" not found after a successful login! This should never happen.`, 'errLog.txt', { print: true });
	}

	// Close their sockets, delete their invites, delete their session cookies
	doStuffOnLogout(res, user_id, username);

	const reason_deleted = "user request";
	if (deleteUser(user_id, reason_deleted)) {
		logEvents(`User ${claimedUsername} deleted their account.`, "deletedAccounts.txt", { print: true });
		return res.send('OK'); // 200 is default code
	} else {
		logEvents(`Can't delete ${claimedUsername}'s account after a correct password entered, they do not exist.`, 'errLog.txt', { print: true });
		return res.status(404).json({ 'message' : getTranslationForReq("server.javascript.ws-deleting_account_not_found", req) });
	}
}


export {
	removeAccount,
};