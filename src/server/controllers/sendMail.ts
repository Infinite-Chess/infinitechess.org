
import nodemailer from 'nodemailer';
import { Response } from 'express';
import { DEV_BUILD, HOST_NAME } from '../config/config';
import { logEventsAndPrint } from '../middleware/logEvents';
import { getMemberDataByCriteria } from '../database/memberManager';

import type { Verification } from './verifyAccountController';
import { AuthenticatedRequest } from '../../types';

// --- Type Definitions ---


/** Structure of a member record. This is all allowed columns of the members table. */
interface MemberRecord {
	user_id?: number,             
	username?: string,
	email?: string,             
	hashed_password?: string,           
	roles?: string | null,     
	joined?: string,
	last_seen?: string,                       
	login_count?: number,                
	preferences?: string | null,
	refresh_tokens?: string | null,                         
	verification?: string | null,
	username_history?: string | null,
	checkmates_beaten?: string
}

// --- Module Setup ---
const EMAIL_USERNAME = process.env.EMAIL_USERNAME;
const EMAIL_APP_PASSWORD = process.env.EMAIL_APP_PASSWORD;

// Create the transporter once and reuse it. This is more efficient.
// If credentials aren't set, the transporter will be null, and sending will be skipped.
const transporter = (EMAIL_USERNAME && EMAIL_APP_PASSWORD)
	? nodemailer.createTransport({
		service: 'gmail',
		auth: {
			user: EMAIL_USERNAME,
			pass: EMAIL_APP_PASSWORD
		},
		// tls: { rejectUnauthorized: false } // Uncomment for local dev if needed
	})
	: null;


// Email Sending Functions ------------------------------------------------------


/**
 * Sends a password reset email to the specified recipient.
 * @param recipientEmail - The email address to send the reset link to.
 * @param resetUrl - The full URL containing the password reset token.
 */
async function sendPasswordResetEmail(recipientEmail: string, resetUrl: string): Promise<void> {
	if (!transporter) {
		console.log("Email environment variables not specified. Not sending password reset email.");
		console.log("Password Reset Link (for dev):", resetUrl);
		return;
	}

	const mailOptions = {
		from: `"Infinite Chess" <${EMAIL_USERNAME}>`,
		to: recipientEmail,
		subject: 'Your Password Reset Request',
		html: `
			<div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; border: 1px solid #999; border-radius: 5px;">
				<h2 style="color: #333;">Password Reset Request</h2>
				<p style="font-size: 16px; color: #555;">We received a request to reset the password for your account.</p>
				<p style="font-size: 16px; color: #555;">Please click the button below to set a new password. This link will expire in 1 hour.</p>
				
				<a href="${resetUrl}" style="font-size: 16px; background-color: #fff; color: black; padding: 10px 20px; text-decoration: none; border: 1px solid black; border-radius: 6px; display: inline-block; margin: 20px 0;">Reset Password</a>
				
				<p style="font-size: 14px; color: #666;">If you did not request a password reset, you can safely ignore this email.</p>
			</div>
		`
	};

	try {
		await transporter.sendMail(mailOptions);
		console.log(`Password reset email sent to ${recipientEmail}`);
	} catch (err) {
		// The 'err' object can be complex, so stringifying or accessing stack is good.
		const errorMessage = err instanceof Error ? err.stack : String(err)
		logEventsAndPrint(`Error sending password reset email: ${errorMessage}`, 'errLog.txt');
		// Re-throw the error so the calling controller knows the email failed to send.
		throw err;
	}
}

/**
 * Sends an account verification email to the specified member.
 * @param user_id - The ID of the user to send the verification email to.
 */
async function sendEmailConfirmation(user_id: number): Promise<void> {
	// Fetch member data required for the email
	const memberData = getMemberDataByCriteria(['username', 'email', 'verification'], 'user_id', user_id) as {
		username: string,
		email: string,
		verification: string | null
	} | {
		username: undefined,
		email: undefined,
		verification: undefined,
	}

	if (!memberData.username) {
		logEventsAndPrint(`Unable to send email confirmation of non-existent member of id (${user_id})!`, 'errLog.txt');
		return;
	}
	
	let verificationJS: Verification | null;
	try {
		// The verification data is stored as a JSON string
		verificationJS = memberData.verification === null ? null : JSON.parse(memberData.verification!);
	} catch (e) {
		logEventsAndPrint(`Failed to parse verification JSON for user_id (${user_id}) while sending account confirmation email.`, 'errLog.txt');
		return;
	}

	if (verificationJS === null || verificationJS.verified) {
		console.log("User already verified. Not sending verification email.");
		return;
	}

	const host = DEV_BUILD ? `localhost:${process.env.HTTPSPORT_LOCAL}` : HOST_NAME;
	const url_string = `https://${host}/verify/${memberData.username.toLowerCase()}/${verificationJS.code}`;
	const verificationUrl = new URL(url_string).toString();

	if (!transporter) {
		console.log("Email environment variables not specified. Not sending email confirmation.");
		console.log("Verification Link (for dev):", verificationUrl);
		return;
	}

	const mailOptions = {
		from: `"Infinite Chess" <${EMAIL_USERNAME}>`,
		to: memberData.email,
		subject: 'Verify your account',
		html: `
			<div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; border: 1px solid #999; border-radius: 5px;">
				<h2 style="color: #333;">Welcome to InfiniteChess.org!</h2>
				<p style="font-size: 16px; color: #555;">Thank you, <strong>${memberData.username}</strong>, for creating an account. Please click the button below to verify your account:</p>
				
				<a href="${verificationUrl}" style="font-size: 16px; background-color: #fff; color: black; padding: 10px 20px; text-decoration: none; border: 1px solid black; border-radius: 6px; display: inline-block; margin: 20px 0;">Verify Account</a>
				
				<p style="font-size: 14px; color: #666;">If this wasn't you, please ignore this email or reply to let us know.</p>
			</div>
		`
	};

	try {
		await transporter.sendMail(mailOptions);
		console.log(`Verification email sent to member ${memberData.username} of ID ${user_id}!`);
	} catch (err) {
		const errorMessage = err instanceof Error ? err.stack : JSON.stringify(err);
		logEventsAndPrint(`Error sending verification email: ${errorMessage}`, 'errLog.txt');
	}
};

/**
 * API to resend the verification email. 
 * @param req - The Express request object, extended with memberInfo.
 * @param res - The Express response object.
 */
function requestConfirmEmail(req: AuthenticatedRequest, res: Response): void {
	if (!(req.memberInfo?.signedIn)) {
		logEventsAndPrint("Unauthorized attempt to resend verification email.", 'errLog.txt');
		// Use 401 for unauthorized/unauthenticated
		res.status(401).json({ message: 'You must be signed in to perform this action.' });
		return;
	}

	const usernameParam = req.params.member;
	const { user_id, username } = req.memberInfo;

	// Ensure the authenticated user is requesting for themselves
	if (username.toLowerCase() !== usernameParam.toLowerCase()) {
		const errText = `Member "${username}" (ID: ${user_id}) attempted to send verification email for user (${usernameParam})!`;
		logEventsAndPrint(errText, 'hackLog.txt');
		res.status(403).json({ sent: false, message: 'Forbidden' }); // 403 Forbidden is more appropriate
		return;
	}

	const { verification } = getMemberDataByCriteria(['verification'], 'user_id', user_id) as {
		verification: string | null | undefined,
	};
	if (verification === undefined) {
		logEventsAndPrint(`Could not find member "${username}" (ID: ${user_id}) when requesting confirmation email!`, 'errLog.txt');
		res.status(404).json({ message: 'Member not found.', sent: false });
		return;
	}

	let verificationJS: Verification;
	try {
		// The verification data is stored as a JSON string
		verificationJS = verification === null ? null : JSON.parse(verification);
	} catch (e) {
		logEventsAndPrint(`Failed to parse verification JSON for user_id (${user_id}) while RE-sending account confirmation email.`, 'errLog.txt');
		return;
	}

	// ONLY send email if they haven't already verified!
	if (verificationJS && verificationJS.verified) {
		const hackText = `Member "${username}" (ID: ${user_id}) tried requesting another verification email after they've already verified.`;
		logEventsAndPrint(hackText, 'hackLog.txt');
		res.status(400).json({ sent: false, message: 'Account is already verified.' }); // 400 Bad Request
		return;
	}

	// Send the email (fire-and-forget, no need to await here as we respond to the user immediately)
	sendEmailConfirmation(user_id);

	res.json({ sent: true });
};


// Exports --------------------------------------------------


export {
	sendPasswordResetEmail,
	sendEmailConfirmation,
	requestConfirmEmail,
};

export type {
	MemberRecord,
};