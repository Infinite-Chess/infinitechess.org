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

/** Header/button accent color: a dark neutral grey. */
const ACCENT_COLOR = '#383838';
/** Page background behind the email card: a warm off-white. */
const PAGE_BG_COLOR = '#f4f1ea';

/** Builds the HTML for the account verification email. */
function buildVerificationEmailHtml(username: string, verificationUrl: string): string {
	return `
		<!-- Preheader: inbox preview text, hidden in the body. -->
		<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">Confirm your email address to activate your account.</div>
		<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${PAGE_BG_COLOR};">
			<tr>
				<td align="center" style="padding:24px 12px;">
					<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;font-family:Arial,Helvetica,sans-serif;">
						<!-- Header -->
						<tr>
							<td align="center" style="background-color:${ACCENT_COLOR};border-radius:12px 12px 0 0;padding:28px 24px;">
								<div style="color:#ffffff;font-size:22px;font-weight:bold;letter-spacing:0.5px;"><span style="font-size:26px;">&#937;</span> InfiniteChess.org</div>
							</td>
						</tr>
						<!-- Body -->
						<tr>
							<td style="background-color:#ffffff;padding:40px 40px 32px;">
								<h1 style="margin:0 0 16px;color:#1e1e1e;font-size:24px;font-weight:bold;">Welcome, ${username}!</h1>
								<p style="margin:0 0 28px;color:#444444;font-size:16px;line-height:1.6;">Confirm your email address to activate your account.</p>
								<!-- Bulletproof button -->
								<table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 28px;">
									<tr>
										<td bgcolor="${ACCENT_COLOR}" style="border-radius:6px;">
											<a href="${verificationUrl}" target="_blank" style="display:inline-block;padding:14px 36px;color:#ffffff;font-size:16px;font-weight:bold;text-decoration:none;">Verify my account</a>
										</td>
									</tr>
								</table>
								<p style="margin:0 0 8px;color:#777777;font-size:13px;line-height:1.6;">Button not working? Try this link instead, and/or copying and pasting it into your browser:</p>
								<p style="margin:0 0 24px;font-size:13px;line-height:1.6;word-break:break-all;"><a href="${verificationUrl}" target="_blank" style="color:${ACCENT_COLOR};text-decoration:underline;">${verificationUrl}</a></p>
								<p style="margin:0;color:#999999;font-size:13px;line-height:1.6;">This link will expire in 24 hours. If you didn't create an account, please ignore this email.</p>
							</td>
						</tr>
						<!-- Footer -->
						<tr>
							<td align="center" style="padding:24px 24px 8px;">
								<p style="margin:0;color:#999999;font-size:12px;line-height:1.6;">InfiniteChess.org &mdash; chess on an infinite board.</p>
							</td>
						</tr>
					</table>
				</td>
			</tr>
		</table>
	`;
}

/** Plain-text alternative to the verification email, for text-only clients & deliverability. */
function buildVerificationEmailText(username: string, verificationUrl: string): string {
	return `Welcome to InfiniteChess.org, ${username}!

Confirm your email address to activate your account:

${verificationUrl}

This link will expire in 24 hours. If you didn't create an account, please ignore this email.

— InfiniteChess.org`;
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

		const sent = await mailer.send('registration', {
			to: recipientEmail,
			subject: 'Verify Your Account',
			html: buildVerificationEmailHtml(username, verificationUrl),
			text: buildVerificationEmailText(username, verificationUrl),
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
