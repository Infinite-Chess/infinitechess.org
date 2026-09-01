// src/server/controllers/passwordResetController.ts

/**
 * The password-reset flow: emailing a single-use reset link, serving the reset page it
 * points at, and setting the new password once the token checks out.
 *
 * See docs/systems/PASSWORD_RESET.md.
 */

import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { Request, Response } from 'express';

import jsutil from '../../shared/util/jsutil.js';
import validators from '../../shared/util/validators.js';
import socketutil from '../../shared/util/socketutil.js';

import db from '../database/database.js';
import roles from './roles.js';
import urlUtils from '../utility/urlUtils.js';
import logEvents from '../utility/logEvents.js';
import emailService from '../utility/emailService.js';
import sessionManager from '../auth/sessionManager.js';
import socketRegistry from '../socket/socketRegistry.js';
import blacklistManager from '../database/blacklistManager.js';
import accountValidation from './accountValidation.js';

// Types -----------------------------------------------------------------------

/** The `password_reset_tokens` columns a reset-token lookup needs. */
type TokenRecord = { user_id: number; hashed_token: string };

/**
 * The member fields read inside the reset transaction,
 * needed to re-login the browser and email the receipt.
 */
type ResetTransactionResult = {
	user_id: number;
	username: string;
	roles: string | null;
	email: string;
};

/**
 * How long a password-reset token stays valid, in milliseconds.
 * IF CHANGED: update the "1 hour" copy in the email toml component.
 */
const PASSWORD_RESET_TOKEN_EXPIRY_MS: number = 1000 * 60 * 60; // 1 Hour

/**
 * `POST /api/forgot-password` — looks up the member by email and, unless blacklisted, issues a
 * single-use reset token and emails the reset link. Always returns the same generic 200
 * (unknown, sendable, or blacklisted alike) to prevent email enumeration.
 */
async function handleForgot(req: Request, res: Response): Promise<void> {
	const email = verifyBodyHasForgotPasswordData(req, res);
	if (!email) return; // Response already sent

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
			if (blacklistManager.isBlacklisted(email)) {
				logEvents.addAndPrint(
					`Skipping sending password reset email to blacklisted address ${email} (user_id ${userId}).`,
					'blacklistLog',
				);
			} else {
				// Generate a high-entropy token, store only its hash, and email the plain token.
				const plainToken: string = crypto.randomBytes(32).toString('base64url');
				const hashedTokenForDb: string = hashResetToken(plainToken);
				const expiresAt: number = Date.now() + PASSWORD_RESET_TOKEN_EXPIRY_MS;

				db.run(
					'INSERT INTO password_reset_tokens (user_id, hashed_token, expires_at) VALUES (?, ?, ?)',
					[userId, hashedTokenForDb, expiresAt],
				);

				const baseUrl = urlUtils.getAppBase();
				const resetUrl = new URL(`${baseUrl}/reset-password/${plainToken}`).toString();

				logEvents.add(
					`Sending password reset email to user_id (${userId})...`,
					'loginAttempts',
				);
				emailService.sendPasswordResetEmail(email, resetUrl, req.lang); // Fire-and-forget
			}
		} else {
			logEvents.addAndPrint(
				`No member exists with the email (${logEvents.escapeLogNewlines(email)}). Not sending password reset email.`,
				'loginAttempts',
			);
		}

		// ALWAYS return the same generic 200 to prevent email enumeration.
		res.sendStatus(200);
	} catch (error) {
		const errorMessage: string =
			'Forgot password database error: ' + jsutil.getErrorStack(error);
		logEvents.addAndPrint(errorMessage, 'errLog');
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
function getPageState(req: Request): { state: 'valid' | 'invalid' } {
	const token = req.params['token']!;
	const match = findUnexpiredResetTokenRecord(token);
	return { state: match ? 'valid' : 'invalid' };
}

/** Finds the unexpired password-reset token row matching the given plain token, or returns undefined. */
function findUnexpiredResetTokenRecord(token: string): TokenRecord | undefined {
	const hashed_token = hashResetToken(token);
	return db.get<TokenRecord>(
		'SELECT user_id, hashed_token FROM password_reset_tokens WHERE hashed_token = ? AND expires_at > ?',
		[hashed_token, Date.now()],
	);
}

/**
 * `POST /api/reset-password` — validates the emailed token and new password, updates the
 * password, invalidates the used token and all of the member's existing sessions, then logs
 * this browser in and sends a password-changed receipt email.
 */
async function handleReset(req: Request, res: Response): Promise<void> {
	// Structural body validation.
	const body = verifyBodyHasResetPasswordData(req, res);
	if (!body) return; // Response already sent
	const { token, password } = body;

	// Password strength rules (e.g., length)
	if (!accountValidation.doPasswordFormatChecks(password, req, res)) return;

	try {
		// Fast pre-check: reject clearly invalid/expired tokens before expensive bcrypt work.
		// The authoritative one-time guarantee is still enforced in the transaction below.
		const precheckTokenRecord = findUnexpiredResetTokenRecord(token);
		if (!precheckTokenRecord) {
			logEvents.add(`Invalid or expired password reset token presented.`, 'loginAttempts');
			// The tokenInvalid flag tells the client to reload (re-SSRing the expired-link card).
			res.status(400).json({ tokenInvalid: true });
			return;
		}

		// Hash the New Password
		const hashedNewPassword = await bcrypt.hash(
			password,
			accountValidation.PASSWORD_SALT_ROUNDS,
		);
		const hashedToken = precheckTokenRecord.hashed_token;

		// In one transaction: atomically consume the token, update the password, and kill all existing sessions.
		// If two requests race with the same token, only one can consume it.
		const resetTransaction = db.transaction((): ResetTransactionResult | undefined => {
			const consumedToken = db.get<{ user_id: number }>(
				`DELETE FROM password_reset_tokens
				 WHERE hashed_token = ? AND expires_at > ?
				 RETURNING user_id`,
				[hashedToken, Date.now()],
			);

			// ALREADY CONSUMED / expired token.
			if (consumedToken === undefined) return undefined;

			const user_id = consumedToken.user_id;

			const updatedMember = db.get<{ username: string; roles: string | null; email: string }>(
				`UPDATE members
				 SET hashed_password = ?
				 WHERE user_id = ?
				 RETURNING username, roles, email`,
				[hashedNewPassword, user_id],
			);

			if (updatedMember === undefined) {
				// If the user doesn't exist, throw an error to roll back the transaction.
				throw new Error(`Failed to update password for user_id (${user_id}), user may not exist.`); // prettier-ignore
			}

			// Terminate all of the user's active sessions (socket closures below).
			db.run('DELETE FROM refresh_tokens WHERE user_id = ?', [user_id]);

			return { user_id, ...updatedMember };
		});

		// Execute the transaction. If any part of it throws an error,
		// the entire transaction is rolled back automatically.
		const member = resetTransaction();

		// Handle the token being expired or consumed by another
		// request between the pre-check and the async bcrypt hashing.
		if (member === undefined) {
			logEvents.add(
				`Password reset token ALREADY CONSUMED after pre-check and before transaction.`,
				'loginAttempts',
			);
			res.status(400).json({ tokenInvalid: true });
			return;
		}

		// Every session is now dead, so close their sockets with the same reason logging
		// out uses — the client reloads and re-auths off whatever session it has left.
		socketRegistry.closeAllOfMember(member.user_id, 1008, socketutil.CLOSURE_REASONS.LOGGED_OUT); // prettier-ignore

		// Issue a fresh session to this browser — the device that proved control
		// of the account by clicking the email link and setting the new password.
		// Also, send an out-of-band security receipt notifying them of the change.
		// roles is a stringified JSON array in the database; parse it.
		const parsedRoles = roles.parse(member.roles);
		sessionManager.create(req, res, member.user_id, member.username, parsedRoles, false);

		// Fire-and-forget security receipt.
		emailService.sendPasswordChangedEmail(member.email, req.lang);

		// Send Success Response. The session cookie is now set, so the client redirects home.
		res.sendStatus(200);

		// Log the successful password reset
		logEvents.add(`Password reset successful for user_id (${member.user_id})`, 'loginAttempts');
	} catch (error) {
		const errorMessage: string = 'Reset password error: ' + jsutil.getErrorStack(error);
		logEvents.addAndPrint(errorMessage, 'errLog');
		res.status(500).json({
			message: req.t.responses.errors.server_error,
		});
	}
}

/**
 * The single structural gate for the reset-password body: requires `token` and `password` both
 * be non-empty strings. Anything else is a hand-crafted request — auto-sends a 400 and returns undefined.
 * @returns The two values, or undefined if the body is malformed (response already sent).
 */
function verifyBodyHasResetPasswordData(
	req: Request,
	res: Response,
): { token: string; password: string } | undefined {
	const { token, password } = req.body;

	if (
		!token ||
		!password ||
		typeof token !== 'string' ||
		typeof password !== 'string' ||
		// Clearly more than the 43 chars of a valid token. Don't waste time hashing it.
		token.length > 100
	) {
		// Unlocalized as this can only be hit from hand-crafted/malformed requests.
		res.status(400).json({ message: 'Request body malformed.' });
		return undefined;
	}

	return { token, password };
}

/**
 * Structural gate for the forgot-password body: `email` must be a non-empty, well-formed email
 * string. Format validity is independent of registration, so this never reveals whether the
 * address has an account.
 * @returns The email, or undefined if malformed (400 already sent).
 */
function verifyBodyHasForgotPasswordData(req: Request, res: Response): string | undefined {
	const { email } = req.body;

	if (
		!email ||
		typeof email !== 'string' ||
		// Reject malformed/oversized emails before the DB lookup.
		// A string that fails format validation can never be registered anyway.
		validators.validateEmail(email) !== validators.EmailValidationResult.Ok
	) {
		// Unlocalized as this can only be hit from hand-crafted/malformed requests.
		res.status(400).json({ message: 'Request body malformed.' });
		return undefined;
	}

	return email;
}

// Exports ---------------------------------------------------------------------

export default { handleForgot, getPageState, handleReset };
