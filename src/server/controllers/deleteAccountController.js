/**
 * This module handles account deletion.
 */

import { logEvents } from "../middleware/logEvents.js";
import { getTranslationForReq } from "../utility/translate.js";
import { deleteUser, getMemberDataByCriteria } from "../database/memberManager.js";
import { testPasswordForRequest } from './authController.js';
import { revokeSession } from './authenticationTokens/sessionManager.js';
import { closeAllSocketsOfMember } from '../socket/socketManager.js';



/**
 * Route that removes a user account if they request to delete it.
 * Checks if there password was correct first.
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

	const { user_id } = getMemberDataByCriteria(['user_id'], 'username', claimedUsername);
	if (user_id === undefined) {
		return logEvents(`Unable to find member of claimed username "${claimedUsername}" after a correct password to delete their account!`, 'errLog.txt', { print: true });
		// if (user_id === undefined) return logEvents(`User "${usernameCaseInsensitive}" not found after a successful login! This should never happen.`, 'errLog.txt', { print: true });
	}
	
	// Close their sockets, delete their invites, delete their session cookies...
	revokeSession(res);

	const reason_deleted = "user request";
	const result = deleteAccount(user_id, reason_deleted); // { success, result (if failed) }
	if (result.success) { // Success!!
		logEvents(`User ${claimedUsername} deleted their account.`, "deletedAccounts.txt", { print: true });
		return res.send('OK'); // 200 is default code
	} else { // Failure
		logEvents(`Can't delete ${claimedUsername}'s account after a correct password entered. Reason: ${result.reason}`, 'errLog.txt', { print: true });
		return res.status(404).json({ 'message' : getTranslationForReq("server.javascript.ws-deleting_account_not_found", req) });
	}
}

/**
 * Deletes a user's account by user_id,
 * terminates all their login session,
 * and closes all their open websockets.
 * @param {number} user_id 
 * @param {string} reason_deleted - Must be one of memberManager.validDeleteReasons
 * @returns {object} A result object: { success (boolean), reason (string, if failed) }
 */
function deleteAccount(user_id, reason_deleted) {
	
	const result = deleteUser(user_id, reason_deleted); // { success, result (if failed) }

	// Close their sockets, delete their invites, delete their session cookies...
	if (result.success) closeAllSocketsOfMember(user_id, 1008, "Logged out");

	return result;

	// Account deleting automatically invalidates all their sessions,
	// because their refresh_tokens are deleted.
	// However, they will have to refresh the page for their page and navigation links to update.
}


export {
	removeAccount,
	deleteAccount,
};