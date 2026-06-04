// src/server/controllers/emailController.ts

/*
 * This module constructs and dispatches application emails:
 * password resets, account verification, and rating abuse alerts.
 *
 * It also handles the API endpoint for resending verification emails.
 */

import type { Request, Response } from 'express';

import mailer from '../utility/mailer.js';
import { getAppBaseUrl } from '../utility/urlUtils.js';
import { isBlacklisted } from '../database/blacklistManager.js';
import { logEventsAndPrint } from '../middleware/logEvents.js';
import { getMemberDataByCriteria } from '../database/memberManager.js';

// --- Helper Functions ---

function createEmailHtmlWrapper(title: string, contentHtml: string): string {
	return `
		<div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; border: 1px solid #999; border-radius: 5px;">
			<h2 style="color: #333;">${title}</h2>
			${contentHtml}
		</div>
	`;
}

// --- Email Sending Functions ---

async function sendPasswordResetEmail(recipientEmail: string, resetUrl: string): Promise<void> {
	const content = `
		<p style="font-size: 16px; color: #555;">We received a request to reset the password for your account.</p>
		<p style="font-size: 16px; color: #555;">Please click the button below to set a new password. This link will expire in 1 hour.</p>
		<a href="${resetUrl}" style="font-size: 16px; background-color: #fff; color: black; padding: 10px 20px; text-decoration: none; border: 1px solid black; border-radius: 6px; display: inline-block; margin: 20px 0;">Reset Password</a>
		<p style="font-size: 14px; color: #666;">If you did not request a password reset, you can safely ignore this email.</p>
	`;

	try {
		const sent = await mailer.send({
			to: recipientEmail,
			subject: 'Your Password Reset Request',
			html: createEmailHtmlWrapper('Password Reset Request', content),
		});
		if (sent) {
			// console.log(`Password reset email sent to ${recipientEmail}`);
		} else {
			console.log(`Password Reset Link: ${resetUrl}`);
		}
	} catch (err) {
		const errorMessage = err instanceof Error ? err.stack : String(err);
		logEventsAndPrint(`Error sending password reset email: ${errorMessage}`, 'errLog.txt');
		throw new Error('Unexpected transporter error sending password reset email.');
	}
}

/**
 * Sends an account verification email, IF the recipient is not blacklisted.
 * The link points at the verify endpoint that promotes the pending registration.
 * @param recipientEmail - The recipient's email address, in LOWERCASE.
 * @param username - The username to be shown in the email body.
 * @param verificationToken - The secret to be embedded in the verification link.
 */
async function sendEmailConfirmation(
	recipientEmail: string,
	username: string,
	verificationToken: string,
): Promise<void> {
	if (isBlacklisted(recipientEmail)) {
		logEventsAndPrint(
			`[BLOCKED] Skipping email confirmation to ${recipientEmail} (Blacklisted)`,
			'blacklistLog.txt',
		);
		return;
	}

	try {
		const baseUrl = getAppBaseUrl();
		const verificationUrl = new URL(`${baseUrl}/verify/${verificationToken}`).toString();

		const content = `
			<p style="font-size: 16px; color: #555;">Thank you, <strong>${username}</strong>, for creating an account. Please click the button below to verify your account.</p>
			<a href="${verificationUrl}" style="font-size: 16px; background-color: #fff; color: black; padding: 10px 20px; text-decoration: none; border: 1px solid black; border-radius: 6px; display: inline-block; margin: 20px 0;">Verify Account</a>
			<p style="font-size: 14px; color: #666;">If this wasn't you, please ignore this email.</p>
		`;

		const sent = await mailer.send({
			to: recipientEmail,
			subject: 'Verify Your Account',
			html: createEmailHtmlWrapper('Welcome to InfiniteChess.org!', content),
		});

		if (sent) {
			// console.log(`Verification email sent to ${recipientEmail}!`);
		} else {
			console.log(`Verification Link: ${verificationUrl}`);
		}
	} catch (e) {
		const errorMessage = e instanceof Error ? e.stack : String(e);
		logEventsAndPrint(
			`Error during sendEmailConfirmation to ${recipientEmail}: ${errorMessage}`,
			'errLog.txt',
		);
	}
}

/**
 * API to resend the verification email for a logged-in, still-unverified member.
 * TODO(prompt 09): remove this endpoint once the pending-registration /register/resend lands.
 */
function requestConfirmEmail(req: Request, res: Response): void {
	if (!req.memberInfo?.signedIn) {
		res.status(401).json({ message: 'You must be signed in to perform this action.' });
		return;
	}

	// We know the member url param is defined because this route is only used when it is present.
	const usernameParam = req.params['member']!;
	const { user_id, username } = req.memberInfo;

	if (username.toLowerCase() !== usernameParam.toLowerCase()) {
		const errText = `Member "${username}" (ID: ${user_id}) attempted to send verification email for user (${usernameParam})!`;
		logEventsAndPrint(errText, 'hackLog.txt');
		res.status(403).json({ sent: false, message: 'Forbidden' });
		return;
	}

	// Only re-send if the member is still unverified and has a code.
	const record = getMemberDataByCriteria(
		['email', 'verification_code', 'is_verified'],
		'user_id',
		user_id,
	);
	if (record !== undefined && record.is_verified === 0 && record.verification_code) {
		// Fire-and-forget, no need to await here as we respond to the user immediately.
		sendEmailConfirmation(record.email, username, record.verification_code);
	}

	res.json({ sent: true });
}

/**
 * API to send an email warning about rating abuse to our own infinite chess email address
 * @param messageSubject - email subject text
 * @param messageText - email body text
 */
async function sendRatingAbuseEmail(messageSubject: string, messageText: string): Promise<void> {
	try {
		const sent = await mailer.send({
			to: mailer.FROM ?? '',
			subject: messageSubject,
			text: messageText,
		});
		if (sent) {
			// console.log(`Rating abuse warning email sent successfully to ${mailer.FROM}.`);
		} else {
			console.log("Didn't send rating abuse email.");
		}
	} catch (e) {
		const errorMessage = e instanceof Error ? e.stack : String(e);
		void logEventsAndPrint(
			`Error during the sending of rating abuse email with subject "${messageSubject}": ${errorMessage}`,
			'errLog.txt',
		);
	}
}

// --- Exports ---
export { sendPasswordResetEmail, sendEmailConfirmation, requestConfirmEmail, sendRatingAbuseEmail };
