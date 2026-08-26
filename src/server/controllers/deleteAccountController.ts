// src/server/controllers/deleteAccountController.ts

/**
 * This module handles account deletion.
 */

import type { Request, Response } from 'express';
import type { DeleteReason } from '../database/memberManager.js';

import jsutil from '../../shared/util/jsutil.js';
import socketutil from '../../shared/util/socketutil.js';

import logEvents from '../utility/logEvents.js';
import activeGames from '../game/gamemanager/activeGames.js';
import memberManager from '../database/memberManager.js';
import sessionManager from '../auth/sessionManager.js';
import socketRegistry from '../socket/socketRegistry.js';
import authController from './authController.js';
import { getTranslation } from '../utility/translate.js';

/** `DELETE /api/members/:member` — deletes the caller's own account after re-verifying their password. */
async function removeAccount(req: Request, res: Response): Promise<void> {
	const claimedUsername = req.params['member']; // case-insensitive username
	if (!claimedUsername) {
		res.status(400).send('Username required');
		return;
	}

	// The delete account request doesn't come with the username already in the body, so we set that here.
	req.body.username = claimedUsername;
	// The resolved identity comes straight from the DB, with the canonical user_id and username.
	const identity = await authController.testPasswordForRequest(req, res);
	if (!identity) return; // Response already sent

	// Do not allow account deletion if user is currently playing a game
	// THIS DOES NOT PREVENT AN ADMIN MANUALLY DELETING THEIR ACCOUNT
	// If that is done while they are in the middle of a rated game,
	// errors will happen when the game is deleted.
	if (activeGames.hasMember(identity.username)) {
		logEvents.addAndPrint(
			`User ${identity.username} requested account deletion while being listed in some active game.`,
			'deletedAccounts.txt',
		);
		res.status(403).json({
			message: getTranslation('server.javascript.ws-deleting_account_in_game', req.lang),
		});
		return;
	}

	// DELETE ACCOUNT..

	// Close their sockets, delete their seeks, delete their session cookies...
	sessionManager.revoke(res);

	const reason_deleted = 'user request';

	try {
		deleteAccount(identity.user_id, reason_deleted);
	} catch (error: unknown) {
		const detail = jsutil.getErrorMessage(error);
		logEvents.addAndPrint(
			`Can't delete account of user_id (${identity.user_id}) after a correct password entered: ${detail}`,
			'errLog',
		);
		res.status(500).json({ message: req.t.responses.errors.server_error });
		return;
	}

	logEvents.add(
		`Deleted account of user_id (${identity.user_id}) for reason (${reason_deleted}).`,
		'deletedAccounts.txt',
	);
	res.sendStatus(200);
}

/**
 * Deletes a user's account by user_id, terminates all their
 * login session, and closes all their open websockets.
 * @throws If a database error occurs during the deletion process.
 */
function deleteAccount(user_id: number, reason_deleted: DeleteReason): void {
	memberManager.remove(user_id, reason_deleted);

	// Close their sockets, delete their seeks...
	socketRegistry.closeAllOfMember(user_id, 1008, socketutil.ClosureReasons.LOGGED_OUT);

	// Account deleting automatically invalidates all their sessions,
	// because their refresh tokens are deleted.
	// However, they will have to refresh the page for their page and navigation links to update.
}

// Exports ---------------------------------------------------------------------

export default { removeAccount, deleteAccount };
