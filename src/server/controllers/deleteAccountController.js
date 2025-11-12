/**
 * This module handles account deletion.
 */

import { logEventsAndPrint } from "../middleware/logEvents.js";
import { getTranslationForReq } from "../utility/translate.js";
import { deleteUser, getMemberDataByCriteria } from "../database/memberManager.js";
import { testPasswordForRequest } from './authController.js';
import { revokeSession } from './authenticationTokens/sessionManager.js';
import { closeAllSocketsOfMember } from '../socket/socketManager.js';
import { isMemberInSomeActiveGame } from "../game/gamemanager/gamemanager.js";


// Constants -------------------------------------------------------------------------


/**
 * A list of all valid reasons to delete an account.
 * These reasons are stored in the deleted_members table in the database.
 */
const validDeleteReasons = [
	'unverified', // They failed to verify after 3 days
	'user request', // They deleted their own account, or requested it to be deleted.
	'security', // A choice by server admins, for security purpose.
	'rating abuse', // Unfairly boosted their own elo with a throwaway account
];


// Functions -------------------------------------------------------------------------


/**
 * Route that removes a user account if they request to delete it.
 * Checks if there password was correct first.
 * @param {object} req - The request object.
 * @param {object} res - The response object.
 */
async function removeAccount(req, res) {
	const claimedUsername = req.params.member; // case-insensitive username

	// The delete account request doesn't come with the username already in the body, so we set that here.
	req.body.username = claimedUsername;
	if (!(await testPasswordForRequest(req, res))) { // It will have already sent a response
		return logEventsAndPrint(`Incorrect password for user "${claimedUsername}" attempting to remove account!`, "loginAttempts.txt");
	}

	// Get user_id and case-sensitive username from database
	const { user_id, username } = getMemberDataByCriteria(['user_id', 'username'], 'username', claimedUsername, false);
	if (user_id === undefined || username === undefined) {
		return logEventsAndPrint(`Unable to find member of claimed username "${claimedUsername}" after a correct password to delete their account!`, 'errLog.txt');
		// if (user_id === undefined) return logEventsAndPrint(`User "${usernameCaseInsensitive}" not found after a successful login! This should never happen.`, 'errLog.txt');
	}

	// Do not allow account deletion if user is currently playing a game
	// THIS DOES NOT PREVENT AN ADMIN MANUALLY DELETING THEIR ACCOUNT
	// If that is done while they are in the middle of a rated game,
	// errors will happen when the game is deleted.
	if (isMemberInSomeActiveGame(username)) {
		logEventsAndPrint(`User ${username} requested account deletion while being listed in some active game.`, 'deletedAccounts.txt');
		return res.status(403).json({ 'message' : getTranslationForReq("server.javascript.ws-deleting_account_in_game", req) });
	}


	// DELETE ACCOUNT..

	
	// Close their sockets, delete their invites, delete their session cookies...
	revokeSession(res);

	const reason_deleted = "user request";

	try {
		deleteAccount(user_id, reason_deleted);
		logEventsAndPrint(`Deleted account of user_id (${user_id}) for reason (${reason_deleted}).`, "deletedAccounts.txt");
		return res.send('OK'); // 200 is default code
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(`Can't delete account of user_id (${user_id}) after a correct password entered: ${errorMessage}`, 'errLog.txt');
		return res.status(404).json({ 'message' : getTranslationForReq("server.javascript.ws-deleting_account_not_found", req) });
	}
}

/**
 * Deletes a user's account by user_id,
 * terminates all their login session,
 * and closes all their open websockets.
 * @param {number} user_id 
 * @param {string} reason_deleted - Must be one of memberManager.validDeleteReasons
 * 
 * @throws If the delete reason is invalid, or if a database error occurs during the deletion process.
 */
function deleteAccount(user_id, reason_deleted) {
	if (!validDeleteReasons.includes(reason_deleted)) throw Error(`Delete reason (${reason_deleted}) is invalid.`);
	
	deleteUser(user_id, reason_deleted);

	// Close their sockets, delete their invites...
	closeAllSocketsOfMember(user_id, 1008, "Logged out");

	// Account deleting automatically invalidates all their sessions,
	// because their refresh tokens are deleted.
	// However, they will have to refresh the page for their page and navigation links to update.
}


export {
	removeAccount,
	deleteAccount,
};