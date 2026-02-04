// src/server/controllers/passwordResetController.ts

import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { Request, Response } from 'express';

import db from '../database/database.js';
import { getAppBaseUrl } from '../utility/urlUtils.js';
import { isBlacklisted } from '../database/blacklistManager.js';
import { logEventsAndPrint } from '../middleware/logEvents.js';
import { getTranslationForReq } from '../utility/translate.js';
import { sendPasswordResetEmail } from './sendMail.js';
import { deleteAllRefreshTokensForUser } from '../database/refreshTokenManager.js';
import { doPasswordFormatChecks, PASSWORD_SALT_ROUNDS } from './createAccountController.js';

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

			// 2. Invalidate old tokens
			db.run('DELETE FROM password_reset_tokens WHERE user_id = ?', [userId]);

			// 3. Make sure they aren't blacklisted
			if (isBlacklisted(email)) {
				logEventsAndPrint(
					`User has a blacklisted email ${email} when attempting to request a password reset!`,
					'blacklistLog.txt',
				);
				res.status(409).json({
					message: getTranslationForReq('server.javascript.ws-email_blacklisted', req),
				});
				return;
			}

			// 4. Generate plain token
			const plainToken: string = crypto.randomBytes(32).toString('base64url');

			// 5. Hash the plain token
			const hashedTokenForDb: string = await bcrypt.hash(plainToken, PASSWORD_SALT_ROUNDS);

			// 6. Set expiration (e.g., ~1 hour from now in milliseconds)
			const expiresAt: number = Date.now() + PASSWORD_RESET_TOKEN_EXPIRY_MILLIS;

			// 7. Store new token in the database
			db.run(
				'INSERT INTO password_reset_tokens (user_id, hashed_token, expires_at) VALUES (?, ?, ?)',
				[userId, hashedTokenForDb, expiresAt],
			);

			// 8. Construct reset URL using the utility
			const baseUrl = getAppBaseUrl();
			const resetUrl = new URL(`${baseUrl}/reset-password/${plainToken}`).toString();

			// 9. Log the email send attempt
			logEventsAndPrint(
				`Sending password reset email to user_id (${userId})...`,
				'loginAttempts.txt',
			);

			// 10. Send email (must have its own error handling since we're not await'ing an async method!!)
			sendPasswordResetEmail(email, resetUrl).catch((err) => {
				const errorMessage = err instanceof Error ? err.stack : String(err);
				logEventsAndPrint(
					`Background password reset email send failed for user_id (${userId}), email (${email}): ${errorMessage}`,
					'errLog.txt',
				);
			});
		} else {
			logEventsAndPrint(
				`No member exists with the email (${email}). Not sending password reset email.`,
				'loginAttempts.txt',
			);
		}

		// ALWAYS return a generic success message to prevent email enumeration.
		res.status(200).json({
			message: getTranslationForReq('server.javascript.ws-password-reset-link-sent', req),
		});
	} catch (error) {
		const errorMessage: string =
			'Forgot password database error: ' +
			(error instanceof Error ? error.message : String(error));
		logEventsAndPrint(errorMessage, 'errLog.txt');
		res.status(500).json({
			message: 'An error occurred while processing your request. Please try again later.',
		});
		return;
	}
}

type TokenRecord = { user_id: number; hashed_token: string };

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
		// Since we stored a HASH, we cannot query by the plain token directly.
		// We must fetch potential tokens and compare them one by one.
		const now = Date.now();
		const potentialTokens = db.all<TokenRecord>(
			'SELECT user_id, hashed_token FROM password_reset_tokens WHERE expires_at > ?',
			[now],
		);

		let validTokenRecord: TokenRecord | null = null;
		for (const record of potentialTokens) {
			const isMatch = await bcrypt.compare(token, record.hashed_token);
			if (isMatch) {
				validTokenRecord = record;
				break; // Found our match, exit the loop
			}
		}

		// 3. Handle Invalid or Expired Token
		if (!validTokenRecord) {
			logEventsAndPrint(
				`Invalid or expired password reset token used: ${token}`,
				'loginAttempts.txt',
			);
			res.status(400).json({
				message: getTranslationForReq(
					'server.javascript.ws-password-reset-token-invalid',
					req,
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
					`Failed to update password for user_id ${userId}, user may not exist.`,
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

		// Optional but recommended: Send a confirmation email that the password was changed.

		// 7. Send Success Response
		res.status(200).json({
			message: getTranslationForReq('server.javascript.ws-password-change-success', req),
		});

		// 8. Log the successful password reset
		logEventsAndPrint(`Password reset successful for user_id ${userId}`, 'loginAttempts.txt');
	} catch (error) {
		const errorMessage: string =
			'Reset password error: ' + (error instanceof Error ? error.message : String(error));
		logEventsAndPrint(errorMessage, 'errLog.txt');
		res.status(500).json({ message: 'An internal error occurred. Please try again later.' });
	}
}

export { handleForgotPasswordRequest, handleResetPassword };
