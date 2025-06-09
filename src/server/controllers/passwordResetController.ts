
import { Request, Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import db from '../database/database.js';
import { sendPasswordResetEmail } from './sendMail.js';
import { doPasswordFormatChecks, PASSWORD_SALT_ROUNDS } from './createAccountController.js';
import { logEventsAndPrint } from '../middleware/logEvents.js';
import { deleteAllRefreshTokensForUser } from '../database/refreshTokenManager.js';
// @ts-ignore
import { getTranslationForReq } from '../utility/translate.js';


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
		const member = db.get<{ user_id: number }>('SELECT user_id FROM members WHERE email = ? COLLATE NOCASE', [email]);

		if (member) { // User exists, proceed with password reset flow
			const userId: number = member.user_id;

			// 2. Invalidate old tokens (Using database.run for DELETE)
			db.run('DELETE FROM password_reset_tokens WHERE user_id = ?', [userId]);

			// 3. Generate plain token
			const plainToken: string = crypto.randomBytes(32).toString('hex');

			// 4. Hash the plain token
			const hashedTokenForDb: string = await bcrypt.hash(plainToken, PASSWORD_SALT_ROUNDS);
			
			// 5. Set expiration (e.g., ~1 hour from now in seconds)
			const expiresAt: number = Date.now() + PASSWORD_RESET_TOKEN_EXPIRY_MILLIS;

			// 6. Store new token in the database
			db.run(
				'INSERT INTO password_reset_tokens (user_id, hashed_token, expires_at) VALUES (?, ?, ?)',
                [userId, hashedTokenForDb, expiresAt]
			);

			// 7. Construct reset URL
			const appBaseUrl: string = process.env['APP_BASE_URL'] || `${req.protocol}://${req.get('host')}`;
			const resetUrl: string = `${appBaseUrl}/reset-password/${plainToken}`;

			// 8. Send email
			sendPasswordResetEmail(email, resetUrl);
		
			// 9. Log the email sent
			logEventsAndPrint(`Sent password reset email to user_id (${userId})`, 'loginAttempts.txt');
		} else {
			logEventsAndPrint(`No member exists with the email (${email}). Not sending password reset email.`, 'loginAttempts.txt');
		}

		// ALWAYS return a generic success message to prevent email enumeration.
		res.status(200).json({
			message: getTranslationForReq('server.javascript.ws-password-reset-link-sent', req),
		});

	} catch (error) {
		const errorMessage: string = 'Forgot password error: ' + (error instanceof Error ? error.message : String(error));
		logEventsAndPrint(errorMessage, 'errLog.txt');
		res.status(500).json({ message: 'An error occurred while processing your request. Please try again later.' });
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
			[now]
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
			res.status(400).json({ message: 'Password reset token is invalid or has expired.' });
			return;
		}

		// 4. Hash the New Password
		const hashedNewPassword = await bcrypt.hash(password, PASSWORD_SALT_ROUNDS);
		const userId = validTokenRecord.user_id;

		// 5. Update the User's Password in the database
		const updateResult = db.run(
			'UPDATE members SET hashed_password = ? WHERE user_id = ?',
			[hashedNewPassword, userId]
		);

		if (updateResult.changes === 0) {
			// This is an unlikely edge case where the token was valid but the user was deleted.
			// The FOREIGN KEY constraint should prevent this, but it's a good safeguard.
			throw new Error(`Failed to update password for user_id ${userId}, user may not exist.`);
		}
		
		// 6. CRUCIAL: Invalidate/Delete the used token
		// This ensures the token cannot be used again.
		db.run(
			'DELETE FROM password_reset_tokens WHERE hashed_token = ?',
            [validTokenRecord.hashed_token]
		);

		// 7. Terminate the users all active sessions.
		// Recommended for security.
		deleteAllRefreshTokensForUser(userId);

		// Optional but recommended: Send a confirmation email that the password was changed.

		// 8. Send Success Response
		res.status(200).json({ message: getTranslationForReq('server.javascript.ws-password-change-success', req) });

		// 9. Log the successful password reset
		logEventsAndPrint(`Password reset successful for user_id ${userId}`, 'loginAttempts.txt');

	} catch (error) {
		const errorMessage: string = 'Reset password error: ' + (error instanceof Error ? error.message : String(error));
		logEventsAndPrint(errorMessage, 'errLog.txt');
		res.status(500).json({ message: 'An internal error occurred. Please try again later.' });
	}
}


export { handleForgotPasswordRequest, handleResetPassword };