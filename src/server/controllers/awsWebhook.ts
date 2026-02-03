// src/server/controllers/awsWebhook.ts

/**
 * Controller to handle AWS SNS webhooks for SES bounce and complaint notifications.
 */

import type { Request, Response } from 'express';
import MessageValidator from 'sns-validator';
import { addToBlacklist } from '../database/blacklistManager.js';
import { logEventsAndPrint } from '../middleware/logEvents.js';

const validator = new MessageValidator();

/**
 * Handles incoming webhooks from AWS SNS.
 * VERIFIES SIGNATURE to ensure request is actually from AWS.
 */
export async function handleSesWebhook(req: Request, res: Response): Promise<void> {
	const body = req.body;

	// Basic sanity check
	if (!body || !req.headers['x-amz-sns-message-type']) {
		console.error('[AWS WEBHOOK] Invalid request: missing body or headers');
		res.status(400).send('Invalid request');
		return;
	}

	// Verify the AWS Signature
	// We wrap the callback in a Promise to use await
	try {
		await new Promise<void>((resolve, reject) => {
			validator.validate(body, (err, _message) => {
				if (err) reject(err);
				else resolve();
			});
		});
	} catch (err: unknown) {
		const msg = err instanceof Error ? err.message : String(err);
		logEventsAndPrint(
			`[AWS WEBHOOK] Signature Verification Failed! Is this a hacker? Error: ${msg}`,
			'awsNotifications.txt',
		);
		// This likely means a hacker is trying to spoof a request
		res.status(401).send('Invalid signature');
		return;
	}

	// console.log('[AWS WEBHOOK] Signature verified successfully.');

	// If we get here, the request is guaranteed to be from Amazon.
	const messageType = body.Type; // Note: Validator might normalize keys, but usually Body.Type matches header

	// -------------------------------------------------------------------------
	// CASE 1: Subscription Confirmation
	// -------------------------------------------------------------------------
	if (messageType === 'SubscriptionConfirmation') {
		const subscribeUrl = body.SubscribeURL;
		console.log('[AWS WEBHOOK] Verifying subscription...');
		if (subscribeUrl) {
			try {
				// We must perform a GET request to this URL to confirm we own the server
				await fetch(subscribeUrl);
				console.log('[AWS WEBHOOK] Subscription Confirmed!');
				res.status(200).send('Confirmed');
				return;
			} catch (err) {
				console.error('[AWS WEBHOOK] Confirmation failed:', err);
				res.status(500).send('Failed');
				return;
			}
		}
	}

	// -------------------------------------------------------------------------
	// CASE 2: Notification
	// -------------------------------------------------------------------------
	else if (messageType === 'Notification') {
		// console.log('[AWS WEBHOOK] Processing notification...');
		// Log entire message so we can learn unexpected structures
		logEventsAndPrint(
			`[AWS WEBHOOK] Received Notification: ${body.Message}`,
			'awsNotifications.txt',
		);

		let sesMessage;
		try {
			// AWS SNS wraps the actual SES JSON inside a string called "Message"
			// We must parse that inner string.
			sesMessage = JSON.parse(body.Message);
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : String(err);
			logEventsAndPrint(`[AWS WEBHOOK] JSON Parse Error: ${msg}`, 'errLog.txt');
			res.status(400).send('Bad JSON');
			return;
		}

		const type = sesMessage.notificationType;

		// Handle Bounces
		if (type === 'Bounce') {
			const bounce = sesMessage.bounce;
			// We strictly ban Permanent bounces (User Unknown, etc)
			// Transient bounces (Mailbox Full) are usually safe to retry later, but banning them is safer.
			if (bounce.bounceType === 'Permanent') {
				// 'Permanent' or 'Transient'
				const recipients = bounce.bouncedRecipients;
				if (Array.isArray(recipients)) {
					recipients.forEach((recipient: any) => {
						const email = recipient.emailAddress;
						logEventsAndPrint(
							`[AWS WEBHOOK] Hard Bounce: ${email}`,
							'awsNotifications.txt',
						);

						// Add to our blacklist table (our db is synchronious, using better-sqlite3)
						addToBlacklist(email, 'bounce');
					});
				}
			} else {
				logEventsAndPrint(
					`[AWS WEBHOOK] Bounce Type is not Permanent. No action taken: ${bounce.bounceType}`,
					'awsNotifications.txt',
				);
			}
		}

		// Handle Complaints (Spam Reports)
		else if (type === 'Complaint') {
			const recipients = sesMessage.complaint.complainedRecipients;
			if (Array.isArray(recipients)) {
				recipients.forEach((recipient: any) => {
					const email = recipient.emailAddress;
					logEventsAndPrint(`[AWS WEBHOOK] Complaint: ${email}`, 'awsNotifications.txt');
					addToBlacklist(email, 'spam_report');
				});
			}
		} else {
			logEventsAndPrint(
				`[AWS WEBHOOK] Unknown notification type: ${type}`,
				'awsNotifications.txt',
			);
		}
	} else {
		logEventsAndPrint(
			`[AWS WEBHOOK] Unknown message type: ${messageType}`,
			'awsNotifications.txt',
		);
	}

	// Always return 200 OK.
	// If we return 500, AWS will keep retrying to send us the same bounce event.
	res.status(200).send('OK');
}
