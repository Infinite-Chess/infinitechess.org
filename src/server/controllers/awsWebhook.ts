// src/controllers/awsWebhook.ts

import type { Request, Response } from 'express';

import { addToBlacklist } from '../database/blacklistManager.js';
import { logEventsAndPrint } from '../middleware/logEvents.js';

/**
 * Handles incoming webhooks from AWS SNS (Simple Notification Service).
 * This is used to track SES Bounces and Spam Complaints.
 */
export async function handleSesWebhook(req: Request, res: Response): Promise<void> {
	// AWS sends the message type in the header
	const messageType = req.headers['x-amz-sns-message-type'];

	// Ensure we actually have a body to work with
	const body = req.body;
	if (!body) {
		console.error('[AWS WEBHOOK] Received empty body');
		res.status(400).send('Empty body');
		return;
	}

	// -------------------------------------------------------------------------
	// CASE 1: Subscription Confirmation (The "Handshake")
	// -------------------------------------------------------------------------
	if (messageType === 'SubscriptionConfirmation') {
		const subscribeUrl = body.SubscribeURL;
		console.log('[AWS WEBHOOK] Received Subscription Confirmation request.');

		if (subscribeUrl) {
			try {
				// We must perform a GET request to this URL to confirm we own the server
				await fetch(subscribeUrl);
				console.log('[AWS WEBHOOK] Successfully confirmed SNS subscription!');
				res.status(200).send('Confirmed');
				return;
			} catch (err) {
				console.error('[AWS WEBHOOK] Failed to confirm subscription:', err);
				res.status(500).send('Failed to visit confirmation URL');
				return;
			}
		}
	}

	// -------------------------------------------------------------------------
	// CASE 2: Notification (Actual Data)
	// -------------------------------------------------------------------------
	if (messageType === 'Notification') {
		let sesMessage;

		try {
			// AWS SNS wraps the actual SES JSON inside a string called "Message"
			// We must parse that inner string.
			sesMessage = JSON.parse(body.Message);
		} catch (e) {
			console.error('[AWS WEBHOOK] Failed to parse inner SNS Message JSON:', e);
			res.status(400).send('Bad JSON format');
			return;
		}

		const type = sesMessage.notificationType;

		// Handle Bounces
		if (type === 'Bounce') {
			const bounce = sesMessage.bounce;
			const bounceType = bounce.bounceType; // 'Permanent' or 'Transient'

			// We strictly ban Permanent bounces (User Unknown, etc)
			// Transient bounces (Mailbox Full) are usually safe to retry later, but banning them is safer.
			if (bounceType === 'Permanent') {
				const recipients = bounce.bouncedRecipients;

				if (Array.isArray(recipients)) {
					recipients.forEach((recipient: any) => {
						const email = recipient.emailAddress;
						logEventsAndPrint(
							`[AWS WEBHOOK] Hard Bounce detected for: ${email}`,
							'awsNotifications.txt',
						);

						// Add to our blacklist table
						addToBlacklist(email, 'bounce');
					});
				}
			}
		}

		// Handle Complaints (Spam Reports)
		if (type === 'Complaint') {
			const complaint = sesMessage.complaint;
			const recipients = complaint.complainedRecipients;

			if (Array.isArray(recipients)) {
				recipients.forEach((recipient: any) => {
					const email = recipient.emailAddress;
					logEventsAndPrint(
						`[AWS WEBHOOK] Spam Complaint detected for: ${email}`,
						'awsNotifications.txt',
					);

					// Add to our blacklist table
					addToBlacklist(email, 'spam_report');
				});
			}
		}
	}

	// Always return 200 OK.
	// If we return 500, AWS will keep retrying to send us the same bounce event.
	res.status(200).send('OK');
}
