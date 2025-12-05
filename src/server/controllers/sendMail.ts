// src/controllers/sendMail.ts

import nodemailer from 'nodemailer';
import { Response } from 'express';
import { SESClient } from '@aws-sdk/client-ses';
import { fromEnv } from '@aws-sdk/credential-providers';
// Import entire module for nodemailer SES transport (needs access to SendRawEmailCommand)
import * as aws from '@aws-sdk/client-ses';
import { logEventsAndPrint } from '../middleware/logEvents.js';
import { getMemberDataByCriteria, MemberRecord } from '../database/memberManager.js';

import { IdentifiedRequest } from '../types.js';
import { getAppBaseUrl } from '../utility/urlUtils.js';
import { isBlacklisted } from '../database/blacklistManager.js';

// --- Module Setup ---
const AWS_REGION = process.env['AWS_REGION'];
const EMAIL_FROM_ADDRESS = process.env['EMAIL_FROM_ADDRESS'];
const AWS_ACCESS_KEY_ID = process.env['AWS_ACCESS_KEY_ID'];
const AWS_SECRET_ACCESS_KEY = process.env['AWS_SECRET_ACCESS_KEY'];

/**
 * Who our sent emails will appear as if they're from.
 */
const FROM = EMAIL_FROM_ADDRESS;

// Create SES client
const sesClient =
	AWS_REGION && EMAIL_FROM_ADDRESS && AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY
		? new SESClient({
				region: AWS_REGION,
				credentials: fromEnv(),
			})
		: null;

// Create nodemailer transporter using SES
const transporter = sesClient
	? nodemailer.createTransport({
			SES: { ses: sesClient, aws },
		} as nodemailer.TransportOptions)
	: null;

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
	if (!transporter) {
		console.log('Email environment variables not specified. Not sending password reset email.');
		console.log('Password Reset Link (for dev):', resetUrl);
		return;
	}

	const content = `
		<p style="font-size: 16px; color: #555;">We received a request to reset the password for your account.</p>
		<p style="font-size: 16px; color: #555;">Please click the button below to set a new password. This link will expire in 1 hour.</p>
		<a href="${resetUrl}" style="font-size: 16px; background-color: #fff; color: black; padding: 10px 20px; text-decoration: none; border: 1px solid black; border-radius: 6px; display: inline-block; margin: 20px 0;">Reset Password</a>
		<p style="font-size: 14px; color: #666;">If you did not request a password reset, you can safely ignore this email.</p>
	`;

	const mailOptions = {
		from: `"Infinite Chess" <${FROM}>`,
		to: recipientEmail,
		subject: 'Your Password Reset Request',
		html: createEmailHtmlWrapper('Password Reset Request', content),
	};

	try {
		await transporter.sendMail(mailOptions);
		console.log(`Password reset email sent to ${recipientEmail}`);
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
	const memberData = getMemberDataByCriteria(
		['username', 'email', 'is_verified', 'verification_code'],
		'user_id',
		user_id,
		false,
	) as MemberRecord;

	if (!memberData.username || !memberData.email) {
		logEventsAndPrint(
			`Unable to send email confirmation for non-existent member of id (${user_id})!`,
			'errLog.txt',
		);
		return;
	}

	if (isBlacklisted(memberData.email)) {
		logEventsAndPrint(
			`[BLOCKED] Skipping email confirmation to ${memberData.email} (Blacklisted)`,
			'emailLog.txt',
		);
		return;
	}

	// Check the new 'is_verified' column directly.
	if (memberData.is_verified === 1) {
		console.log(
			`User ${memberData.username} (ID: ${user_id}) is already verified. Skipping email confirmation.`,
		);
		return;
	}

	// An unverified user MUST have a verification code.
	if (!memberData.verification_code) {
		logEventsAndPrint(
			`User ${memberData.username} (ID: ${user_id}) is unverified but has no verification code. Cannot send email.`,
			'errLog.txt',
		);
		return;
	}

	try {
		// Construct verification URL using the new 'verification_code' column
		const baseUrl = getAppBaseUrl();
		const verificationUrl = new URL(
			`${baseUrl}/verify/${memberData.username.toLowerCase()}/${memberData.verification_code}`,
		).toString();

		if (!transporter) {
			console.log(
				'Email environment variables not specified. Not sending email confirmation.',
			);
			console.log('Verification Link (for dev):', verificationUrl);
			return;
		}

		const content = `
			<p style="font-size: 16px; color: #555;">Thank you, <strong>${memberData.username}</strong>, for creating an account. Please click the button below to verify your account.</p>
			<p style="font-size: 16px; color: #555;">If this takes you to the login page, then as soon as you log in, your account will be verified.</p>
			<a href="${verificationUrl}" style="font-size: 16px; background-color: #fff; color: black; padding: 10px 20px; text-decoration: none; border: 1px solid black; border-radius: 6px; display: inline-block; margin: 20px 0;">Verify Account</a>
			<p style="font-size: 14px; color: #666;">If this wasn't you, please ignore this email.</p>
		`;

		const mailOptions = {
			from: `"Infinite Chess" <${FROM}>`,
			to: memberData.email,
			subject: 'Verify Your Account',
			html: createEmailHtmlWrapper('Welcome to InfiniteChess.org!', content),
		};

		await transporter.sendMail(mailOptions);
		console.log(`Verification email sent to member ${memberData.username} of ID ${user_id}!`);
	} catch (e) {
		const errorMessage = e instanceof Error ? e.stack : String(e);
		logEventsAndPrint(
			`Error during sendEmailConfirmation for user_id (${user_id}): ${errorMessage}`,
			'errLog.txt',
		);
	}
}

/** API to resend the verification email. */
function requestConfirmEmail(req: IdentifiedRequest, res: Response): void {
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
		if (!transporter) {
			console.log(
				'Email environment variables not specified. Not sending rating abuse email.',
			);
			return;
		}

		const mailOptions = {
			from: `Infinite Chess <${FROM}>`,
			to: FROM, // Send to same address as sender for internal notifications
			subject: messageSubject,
			text: messageText,
		};

		await transporter.sendMail(mailOptions);
		console.log(
			`Rating abuse warning email with subject "${messageSubject}" sent successfully to ${FROM}.`,
		);
	} catch (e) {
		const errorMessage = e instanceof Error ? e.stack : String(e);
		await logEventsAndPrint(
			`Error during the sending of rating abuse email with subject "${messageSubject}": ${errorMessage}`,
			'errLog.txt',
		);
	}
}

// --- Exports ---
export { sendPasswordResetEmail, sendEmailConfirmation, requestConfirmEmail, sendRatingAbuseEmail };
