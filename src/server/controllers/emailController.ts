// src/server/controllers/emailController.ts

/*
 * This module constructs and dispatches application emails:
 * password resets, account verification, and rating abuse alerts.
 */

import mailer from '../utility/mailer.js';
import { getAppBaseUrl } from '../utility/urlUtils.js';
import { isBlacklisted } from '../database/blacklistManager.js';
import { logEventsAndPrint } from '../middleware/logEvents.js';

// --- Helper Functions ---

function createEmailHtmlWrapper(title: string, contentHtml: string): string {
	return `
		<div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; border: 1px solid #999; border-radius: 5px;">
			<h2 style="color: #333;">${title}</h2>
			${contentHtml}
		</div>
	`;
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
	try {
		if (isBlacklisted(recipientEmail)) {
			logEventsAndPrint(
				`[BLOCKED] Skipping email confirmation to ${recipientEmail} (Blacklisted)`,
				'blacklistLog',
			);
			return;
		}

		const baseUrl = getAppBaseUrl();
		const verificationUrl = new URL(`${baseUrl}/verify/${verificationToken}`).toString();

		const content = `
			<p style="font-size: 16px; color: #555;">Thank you, <strong>${username}</strong>, for creating an account. Please click the button below to verify your account.</p>
			<a href="${verificationUrl}" style="font-size: 16px; background-color: #fff; color: black; padding: 10px 20px; text-decoration: none; border: 1px solid black; border-radius: 6px; display: inline-block; margin: 20px 0;">Verify Account</a>
			<p style="font-size: 14px; color: #666;">If this wasn't you, please ignore this email.</p>
		`;

		const sent = await mailer.send('registration', {
			to: recipientEmail,
			subject: 'Verify Your Account',
			html: createEmailHtmlWrapper('Welcome to InfiniteChess.org!', content),
		});

		if (sent) {
			// console.log(`Verification email sent to ${recipientEmail}!`);
		} else {
			console.log(`Verification Link: ${verificationUrl}`);
		}
	} catch (error: unknown) {
		const detail = error instanceof Error ? error.stack : String(error);
		logEventsAndPrint(
			`Error during sendEmailConfirmation to ${recipientEmail}: ${detail}`,
			'errLog',
		);
	}
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
		const sent = await mailer.send('password-reset', {
			to: recipientEmail,
			subject: 'Your Password Reset Request',
			html: createEmailHtmlWrapper('Password Reset Request', content),
		});
		if (sent) {
			// console.log(`Password reset email sent to ${recipientEmail}`);
		} else {
			console.log(`Password Reset Link: ${resetUrl}`);
		}
	} catch (error: unknown) {
		const detail = error instanceof Error ? error.stack : String(error);
		logEventsAndPrint(`Error sending password reset email: ${detail}`, 'errLog');
	}
}

/**
 * Sends an out-of-band security receipt notifying the user that their
 * account password was just changed (via the password reset flow).
 */
async function sendPasswordChangedEmail(recipientEmail: string): Promise<void> {
	const baseUrl = getAppBaseUrl();
	const forgotPassUrl = new URL(`${baseUrl}/forgot-password`).toString();

	const content = `
		<p style="font-size: 16px; color: #555;">This is a confirmation that the password for your account was just changed.</p>
		<p style="font-size: 16px; color: #555;">If this was you, no further action is needed.</p>
		<p style="font-size: 14px; color: #666;">If you did <strong>not</strong> make this change, your account may be compromised. Please <a href="${forgotPassUrl}">reset your password again</a> immediately and secure your email account.</p>
	`;

	try {
		await mailer.send('password-changed', {
			to: recipientEmail,
			subject: 'Your Password Was Changed',
			html: createEmailHtmlWrapper('Password Changed', content),
		});
		// console.log(`Password changed email sent to ${recipientEmail}`);
	} catch (error: unknown) {
		const detail = error instanceof Error ? error.stack : String(error);
		logEventsAndPrint(
			`Error sending password changed email to ${recipientEmail}: ${detail}`,
			'errLog',
		);
	}
}

/**
 * API to send an email warning about rating abuse to our own infinite chess email address
 * @param messageSubject - email subject text
 * @param messageText - email body text
 */
async function sendRatingAbuseEmail(messageSubject: string, messageText: string): Promise<void> {
	try {
		const sent = await mailer.send('rating-abuse-alert', {
			to: mailer.FROM ?? '',
			subject: messageSubject,
			text: messageText,
		});
		if (sent) {
			// console.log(`Rating abuse warning email sent successfully to ${mailer.FROM}.`);
		} else {
			console.log("Didn't send rating abuse email.");
		}
	} catch (error: unknown) {
		const detail = error instanceof Error ? error.stack : String(error);
		logEventsAndPrint(
			`Error during the sending of rating abuse email with subject "${messageSubject}": ${detail}`,
			'errLog',
		);
	}
}

// --- Exports ---
export {
	sendEmailConfirmation,
	sendPasswordResetEmail,
	sendPasswordChangedEmail,
	sendRatingAbuseEmail,
};
