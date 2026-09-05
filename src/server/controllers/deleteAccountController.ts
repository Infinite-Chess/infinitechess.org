// src/server/controllers/deleteAccountController.ts

/**
 * This module handles account deletion.
 */

import type { Request, Response } from 'express';
import type { DeleteReason } from '../database/memberManager.js';

import jsutil from '../../shared/util/jsutil.js';
import socketutil from '../../shared/util/socketutil.js';

import logEvents from '../utility/logEvents.js';
import memberManager from '../database/memberManager.js';
import gameLifecycle from '../game/gamemanager/gameLifecycle.js';
import sessionManager from '../auth/sessionManager.js';
import socketRegistry from '../socket/socketRegistry.js';
import authController from './authController.js';

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
 * Deletes a user's account by user_id. It first ensures any game they're in is terminated
 * and logged, and closes all their sockets. The `members` row is deleted last, so no game
 * or socket logic is still running that could read a member that no longer exists.
 * @throws If a database error occurs during the deletion process.
 */
function deleteAccount(user_id: number, reason_deleted: DeleteReason): void {
	// Their live game must be logged BEFORE the member row goes.
	gameLifecycle.concludeForAccountDeletion(user_id, reason_deleted === 'user request');

	// Close their sockets, delete their seeks...
	socketRegistry.closeAllOfMember(user_id, 1008, socketutil.CLOSURE_REASONS.LOGGED_OUT);

	// Account deleting automatically invalidates all their sessions, because their refresh tokens are deleted.
	// However, they will have to refresh the page for their page and navigation links to update.
	memberManager.remove(user_id, reason_deleted);
}

// Exports ---------------------------------------------------------------------

export default { removeAccount, deleteAccount };
