// src/server/controllers/deleteAccountController.ts

/**
 * This module handles account deletion.
 */

import type { Request, Response } from 'express';

import socketutil from '../../shared/util/socketutil.js';

import activegames from '../game/gamemanager/activegames.js';
import { revokeSession } from './authenticationTokens/sessionManager.js';
import { getTranslation } from '../utility/translate.js';
import { testPasswordForRequest } from './authController.js';
import { closeAllSocketsOfMember } from '../socket/socketRegistry.js';
import { deleteMember, DeleteReason } from '../database/memberManager.js';
import { logEvents, logEventsAndPrint } from '../utility/logEvents.js';

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
	const identity = await testPasswordForRequest(req, res);
	if (!identity) return; // Reponse already sent

	// Do not allow account deletion if user is currently playing a game
	// THIS DOES NOT PREVENT AN ADMIN MANUALLY DELETING THEIR ACCOUNT
	// If that is done while they are in the middle of a rated game,
	// errors will happen when the game is deleted.
	if (activegames.hasMember(identity.username)) {
		logEventsAndPrint(
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
	revokeSession(res);

	const reason_deleted = 'user request';

	try {
		deleteAccount(identity.user_id, reason_deleted);
	} catch (error: unknown) {
		const detail = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(
			`Can't delete account of user_id (${identity.user_id}) after a correct password entered: ${detail}`,
			'errLog',
		);
		res.status(500).json({ message: req.t.responses.errors.server_error });
		return;
	}

	logEvents(
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
	deleteMember(user_id, reason_deleted);

	// Close their sockets, delete their seeks...
	closeAllSocketsOfMember(user_id, 1008, socketutil.ClosureReasons.LOGGED_OUT);

	// Account deleting automatically invalidates all their sessions,
	// because their refresh tokens are deleted.
	// However, they will have to refresh the page for their page and navigation links to update.
}

export { removeAccount, deleteAccount };
