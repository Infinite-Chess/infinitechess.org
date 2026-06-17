// src/server/controllers/passwordResetController.ts

import type { Role } from './roles.js';

import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { Request, Response } from 'express';

import db from '../database/database.js';
import { getAppBaseUrl } from '../utility/urlUtils.js';
import { isBlacklisted } from '../database/blacklistManager.js';
import { getTranslation } from '../utility/translate.js';
import { createNewSession } from './authenticationTokens/sessionManager.js';
import { getMemberDataByCriteria } from '../database/memberManager.js';
import { deleteAllRefreshTokensForUser } from '../database/refreshTokenManager.js';
import { doPasswordFormatChecks, PASSWORD_SALT_ROUNDS } from './accountValidation.js';
import { escapeLogNewlines, logEvents, logEventsAndPrint } from '../middleware/logEvents.js';
import { sendPasswordResetEmail, sendPasswordChangedEmail } from './emailController.js';

const PASSWORD_RESET_TOKEN_EXPIRY_MILLIS: number = 1000 * 60 * 60; // 1 Hour

/** Route for when a user REQUESTS a password reset email. */
async function handleForgotPasswordRequest(req: Request, res: Response): Promise<void> {
	const { email } = req.body;

	if (!email || typeof email !== 'string') {
		res.status(400).json({ message: 'Email is required and must be a string.' });
		return;
	}

	try {
		// 1. Find user by email (case-insensitive)
		const member = db.get<{ user_id: number }>(
			'SELECT user_id FROM members WHERE email = ? COLLATE NOCASE',
			[email],
		);

		if (member) {
			// User exists, proceed with password reset flow
			const userId: number = member.user_id;

			// Invalidate any old tokens for this user.
			db.run('DELETE FROM password_reset_tokens WHERE user_id = ?', [userId]);

			// Blacklist gates only the send, never the response — a blacklisted member still
			// falls through to the same generic 200, so it can't be told apart by the response.
			if (isBlacklisted(email)) {
				logEventsAndPrint(
					`Skipping sending password reset email to blacklisted address ${email} (user_id ${userId}).`,
					'blacklistLog',
				);
			} else {
				// Generate a high-entropy token, store only its hash, and email the plain token.
				const plainToken: string = crypto.randomBytes(32).toString('base64url');
				const hashedTokenForDb: string = hashResetToken(plainToken);
				const expiresAt: number = Date.now() + PASSWORD_RESET_TOKEN_EXPIRY_MILLIS;

				db.run(
					'INSERT INTO password_reset_tokens (user_id, hashed_token, expires_at) VALUES (?, ?, ?)',
					[userId, hashedTokenForDb, expiresAt],
				);

				const baseUrl = getAppBaseUrl();
				const resetUrl = new URL(`${baseUrl}/reset-password/${plainToken}`).toString();

				logEvents(
					`Sending password reset email to user_id (${userId})...`,
					'loginAttempts',
				);
				sendPasswordResetEmail(email, resetUrl); // Fire-and-forget
			}
		} else {
			logEventsAndPrint(
				`No member exists with the email (${escapeLogNewlines(email)}). Not sending password reset email.`,
				'loginAttempts',
			);
		}

		// ALWAYS return a generic success message to prevent email enumeration.
		res.status(200).json({
			message: getTranslation('server.javascript.ws-password-reset-link-sent', req.lang),
		});
	} catch (error) {
		const errorMessage: string =
			'Forgot password database error: ' +
			(error instanceof Error ? error.stack : String(error));
		logEventsAndPrint(errorMessage, 'errLog');
		res.status(500).json({
			message: req.t.responses.errors.server_error,
		});
	}
}

/**
 * Hashes a password-reset token for storage and lookup. SHA-256 (not bcrypt) is appropriate
 * here: the token is 256 bits of entropy (crypto.randomBytes(32)), so it can't be brute-forced
 * regardless of hash speed — a DB leak can't recover the token. Being a fast, deterministic
 * hash, it also lets us look the token up by indexed equality instead of scanning + comparing.
 */
function hashResetToken(token: string): string {
	return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Computes the SSR state for the set-password page from the `:token` URL param:
 * whether the token currently matches an unexpired row, WITHOUT consuming it.
 */
function getResetPasswordPageState(req: Request): { state: 'valid' | 'invalid' } {
	const token = req.params['token']!;
	const match = findUnexpiredResetTokenRecord(token);
	return { state: match ? 'valid' : 'invalid' };
}

type TokenRecord = { user_id: number; hashed_token: string };

/** Finds the unexpired password-reset token row matching the given plain token, or returns undefined. */
function findUnexpiredResetTokenRecord(token: string): TokenRecord | undefined {
	const hashed_token = hashResetToken(token);
	return db.get<TokenRecord>(
		'SELECT user_id, hashed_token FROM password_reset_tokens WHERE hashed_token = ? AND expires_at > ?',
		[hashed_token, Date.now()],
	);
}

/**
 * Route for when a user SENDS the password change API.
 * Changes their password in the database.
 */
async function handleResetPassword(req: Request, res: Response): Promise<void> {
	const { token, password } = req.body;

	// 1. Basic Input Validation
	if (!token || !password) {
		res.status(400).json({ message: 'Token and new password are required.' });
		return;
	}
	if (typeof token !== 'string') {
		res.status(400).json({ message: 'Token must be a string.' });
		return;
	}
	if (typeof password !== 'string') {
		res.status(400).json({ message: 'Password must be a string.' });
		return;
	}
	// Password strength rules (e.g., length)
	if (!doPasswordFormatChecks(password, req, res)) return;

	try {
		// 2. Find a matching, unexpired token.
		const validTokenRecord = findUnexpiredResetTokenRecord(token);

		// 3. Handle Invalid or Expired Token
		if (!validTokenRecord) {
			logEvents(`Invalid or expired password reset token used.`, 'loginAttempts');
			res.status(400).json({
				message: getTranslation(
					'server.javascript.ws-password-reset-token-invalid',
					req.lang,
				),
			});
			return;
		}

		// 4. Hash the New Password
		const hashedNewPassword = await bcrypt.hash(password, PASSWORD_SALT_ROUNDS);
		const userId = validTokenRecord.user_id;
		const usedHashedToken = validTokenRecord.hashed_token; // Store for use in transaction

		// 5. Update the User's Password in the database.
		// At the same time, invalidate the used token.
		const resetTransaction = db.transaction(() => {
			// Step 1: Update the User's Password
			const updateResult = db.run(
				'UPDATE members SET hashed_password = ? WHERE user_id = ?',
				[hashedNewPassword, userId],
			);

			if (updateResult.changes === 0) {
				// If the user doesn't exist, we must throw an error
				// to force the transaction to roll back.
				throw new Error(
					`Failed to update password for user_id (${userId}), user may not exist.`,
				);
			}

			// Step 2: Invalidate/Delete the used token
			db.run('DELETE FROM password_reset_tokens WHERE hashed_token = ?', [usedHashedToken]);
		});

		// Execute the transaction. If any part of it throws an error,
		// the entire transaction is rolled back automatically.
		resetTransaction();

		// 6. Terminate all of the user's active sessions.
		// Recommended for security.
		deleteAllRefreshTokensForUser(userId);

		// 7. Issue a fresh session to this browser — the device that proved control
		// of the account by clicking the email link and setting the new password.
		// Also, send an out-of-band security receipt notifying them of the change.
		const member = getMemberDataByCriteria(['username', 'roles', 'email'], 'user_id', userId);
		if (member === undefined) {
			// Should be unreachable: the password UPDATE above would have thrown if the user didn't exist.
			logEventsAndPrint(
				`Password reset succeeded for user_id (${userId}) but the member could not be found to mint a session.`,
				'errLog',
			);
		} else {
			// roles is a stringified JSON array in the database; parse it.
			const roles: Role[] | null = member.roles !== null ? JSON.parse(member.roles) : null;
			createNewSession(req, res, userId, member.username, roles, false);

			// Fire-and-forget security receipt.
			sendPasswordChangedEmail(member.email);
		}

		// 8. Send Success Response. The session cookie is now set, so the client redirects home.
		res.status(200).json({
			message: getTranslation('server.javascript.ws-password-change-success', req.lang),
		});

		// 9. Log the successful password reset
		logEvents(`Password reset successful for user_id (${userId})`, 'loginAttempts');
	} catch (error) {
		const errorMessage: string =
			'Reset password error: ' + (error instanceof Error ? error.stack : String(error));
		logEventsAndPrint(errorMessage, 'errLog');
		res.status(500).json({
			message: req.t.responses.errors.server_error,
		});
	}
}

export { handleForgotPasswordRequest, handleResetPassword, getResetPasswordPageState };
