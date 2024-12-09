/**
 * This module handles account deletion.
 */

import db from '../database/database.js';
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
	revokeSession(res, user_id);

	const reason_deleted = "user request";
	if (deleteAccount(user_id, reason_deleted)) { // Success!!
		logEvents(`User ${claimedUsername} deleted their account.`, "deletedAccounts.txt", { print: true });
		return res.send('OK'); // 200 is default code
	} else { // Failure
		logEvents(`Can't delete ${claimedUsername}'s account after a correct password entered. Either the reason for deletion was invalid, or they do not exist.`, 'errLog.txt', { print: true });
		return res.status(404).json({ 'message' : getTranslationForReq("server.javascript.ws-deleting_account_not_found", req) });
	}
}

/**
 * Deletes a user's account by user_id,
 * terminates all their login session,
 * and closes all their open websockets.
 * @param {number} user_id 
 * @param {string} reason_deleted - Must be one of memberManager.validDeleteReasons
 * @returns {boolean} Whether or not it was successful. (false often means they weren't found)
 */
function deleteAccount(user_id, reason_deleted) {
	// Close their sockets, delete their invites, delete their session cookies...
	closeAllSocketsOfMember(user_id, 1008, "Logged out");

	return deleteUser(user_id, reason_deleted); // A success boolean

	// Account deleting automatically invalidates all their sessions,
	// because their refresh_tokens are deleted.
	// However, they will have to refresh the page for their page and navigation links to update.
}


export {
	removeAccount,
	deleteAccount,
};