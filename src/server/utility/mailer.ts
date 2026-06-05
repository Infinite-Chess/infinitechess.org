// src/server/utility/mailer.ts

/*
 * This module sets up the email transporter (AWS SES via nodemailer)
 * and exposes a low-level sendMail helper for dispatching prepared emails.
 */

import nodemailer from 'nodemailer';
import { fromEnv } from '@aws-sdk/credential-providers';
import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';

import { logEvents } from '../middleware/logEvents.js';

// --- Types ---

/**
 * The category of an outgoing email, recorded in the sent-email log.
 * FUTURE: Add 'tos-update'
 */
type EmailType = 'registration' | 'password-reset' | 'rating-abuse-alert';

/** Options for sending an email. */
type SendMailOptions = {
	to: string;
	subject: string;
} & ({ html: string } | { text: string });

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
		? new SESv2Client({
				region: AWS_REGION,
				credentials: fromEnv(),
			})
		: null;

// Create nodemailer transporter using SES
const transporter = sesClient
	? nodemailer.createTransport({
			SES: { sesClient, SendEmailCommand },
		} as nodemailer.TransportOptions)
	: null;

// --- Functions ---

/**
 * Sends a prepared email via the transporter.
 * Logs a message and returns false if env variables are not configured.
 * @param type - The category of email, recorded in sentEmailsLog.txt.
 * @param options - Email options including recipient, subject, and content (html or text)
 * @returns Whether the email was sent, which won't be the case if env variables aren't present.
 */
async function send(type: EmailType, options: SendMailOptions): Promise<boolean> {
	if (!transporter) {
		console.log('Email environment variables not specified. Not sending email.');
		return false;
	}

	const info = await transporter.sendMail({
		from: `"Infinite Chess" <${FROM}>`,
		...options,
	});

	// Log trail of every email sent: its category and SES messageId.
	logEvents(`${type} | ${info.response}`, 'sentEmailsLog.txt');

	return true;
}

// --- Exports ---

export default { FROM, send };
