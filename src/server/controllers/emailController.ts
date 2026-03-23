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
 * Sends an account verification email to the specified member,
 * IF they are not blacklisted.
 * @param user_id - The ID of the user to send the verification email to.
 */
async function sendEmailConfirmation(user_id: number): Promise<void> {
	const record = getMemberDataByCriteria(
		['username', 'email', 'is_verified', 'verification_code'],
		'user_id',
		user_id,
	);

	if (record === undefined) {
		logEventsAndPrint(
			`Unable to send email confirmation for non-existent member of id (${user_id})!`,
			'errLog.txt',
		);
		return;
	}

	if (isBlacklisted(record.email)) {
		logEventsAndPrint(
			`[BLOCKED] Skipping email confirmation to ${record.email} (Blacklisted)`,
			'blacklistLog.txt',
		);
		return;
	}

	// Check the new 'is_verified' column directly.
	if (record.is_verified === 1) {
		// console.log(
		// 	`User ${record.username} (ID: ${user_id}) is already verified. Skipping email confirmation.`,
		// );
		return;
	}

	// An unverified user MUST have a verification code.
	if (!record.verification_code) {
		logEventsAndPrint(
			`User ${record.username} (ID: ${user_id}) is unverified but has no verification code. Cannot send email.`,
			'errLog.txt',
		);
		return;
	}

	try {
		// Construct verification URL using the new 'verification_code' column
		const baseUrl = getAppBaseUrl();
		const verificationUrl = new URL(
			`${baseUrl}/verify/${record.username.toLowerCase()}/${record.verification_code}`,
		).toString();

		const content = `
			<p style="font-size: 16px; color: #555;">Thank you, <strong>${record.username}</strong>, for creating an account. Please click the button below to verify your account.</p>
			<p style="font-size: 16px; color: #555;">If this takes you to the login page, then as soon as you log in, your account will be verified.</p>
			<a href="${verificationUrl}" style="font-size: 16px; background-color: #fff; color: black; padding: 10px 20px; text-decoration: none; border: 1px solid black; border-radius: 6px; display: inline-block; margin: 20px 0;">Verify Account</a>
			<p style="font-size: 14px; color: #666;">If this wasn't you, please ignore this email.</p>
		`;

		const sent = await mailer.send({
			to: record.email,
			subject: 'Verify Your Account',
			html: createEmailHtmlWrapper('Welcome to InfiniteChess.org!', content),
		});

		if (sent) {
			// console.log(`Verification email sent to member ${record.username} of ID ${user_id}!`);
		} else {
			console.log(`Verification Link: ${verificationUrl}`);
		}
	} catch (e) {
		const errorMessage = e instanceof Error ? e.stack : String(e);
		logEventsAndPrint(
			`Error during sendEmailConfirmation for user_id (${user_id}): ${errorMessage}`,
			'errLog.txt',
		);
	}
}

/** API to resend the verification email. */
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

	// Send the email (fire-and-forget, no need to await here as we respond to the user immediately)
	sendEmailConfirmation(user_id);

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
