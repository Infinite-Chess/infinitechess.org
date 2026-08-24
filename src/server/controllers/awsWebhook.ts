// src/server/controllers/awsWebhook.ts

/**
 * Controller to handle AWS SNS webhooks for SES bounce and complaint notifications.
 */

import type { Request, Response } from 'express';

import * as z from 'zod';
import MessageValidator from 'sns-validator';

import jsutil from '../../shared/util/jsutil.js';

import { logZodError } from '../utility/zodlogger.js';
import { addToBlacklist } from '../database/blacklistManager.js';
import { escapeLogNewlines, logEvents, logEventsAndPrint } from '../utility/logEvents.js';

// Constants -------------------------------------------------------------------------

const validator = new MessageValidator();

// Schemas ---------------------------------------------------------------------------

/** The recipient list shape shared by bounce and complaint notifications. */
type Recipients = z.infer<typeof RecipientsSchema>;
const RecipientsSchema = z.array(z.object({ emailAddress: z.string() }));

/**
 * The SES notification JSON that SNS nests inside its `Message` string.
 * Not strict on purpose — rejecting unknown keys would drop bounces whenever SES adds a field.
 */
const SesNotificationSchema = z.discriminatedUnion('notificationType', [
	z.object({
		notificationType: z.literal('Delivery'),
		mail: z.object({ messageId: z.string() }),
		delivery: z.object({ recipients: z.array(z.string()) }),
	}),
	z.object({
		notificationType: z.literal('Bounce'),
		bounce: z.object({
			// Free-form rather than an enum: a bounce type AWS adds later must not fail
			// validation and cost us the blacklisting. Only 'Permanent' is acted on.
			bounceType: z.string(),
			bouncedRecipients: RecipientsSchema,
		}),
	}),
	z.object({
		notificationType: z.literal('Complaint'),
		complaint: z.object({ complainedRecipients: RecipientsSchema }),
	}),
]);

// Functions -------------------------------------------------------------------------

/**
 * `POST /webhooks/ses` — handles AWS SNS notifications (bounces/complaints),
 * verifying the SNS signature first so only genuine AWS requests are processed.
 * Owns every response this route sends; the helpers below never touch `res`.
 */
export async function handleSesWebhook(req: Request, res: Response): Promise<void> {
	// Basic sanity check
	if (!req.body || !req.headers['x-amz-sns-message-type']) {
		logEventsAndPrint('[AWS WEBHOOK] Invalid request: missing body or headers', 'errLog');
		res.status(400).send('Invalid request');
		return;
	}

	const message = await verifySnsMessage(req.body);
	if (message === undefined) {
		res.status(401).send('Invalid signature');
		return;
	}

	// Everything below is guaranteed to have come from Amazon.
	const messageType = String(message['Type']);

	// Confirming our subscription is the one case where we WANT SNS to retry on failure:
	// until it succeeds we receive no notifications at all. sns-validator guarantees
	// SubscribeURL is present on this message type.
	if (messageType === 'SubscriptionConfirmation') {
		const confirmed = await confirmSubscription(String(message['SubscribeURL']));
		if (confirmed) res.status(200).send('Confirmed');
		else res.status(500).send('Failed');
		return;
	}

	if (messageType === 'Notification') processNotification(message['Message']);
	else
		logEventsAndPrint(`[AWS WEBHOOK] Unknown message type: ${messageType}`, 'awsNotifications');

	// Always return 200 OK.
	// If we return 500, AWS will keep retrying to send us the same bounce event.
	res.status(200).send('OK');
}

/**
 * Verifies the SNS signature, returning the validated message, or undefined if it fails.
 * The validator normalizes key casing, so callers must read what it returns, not the raw body.
 */
async function verifySnsMessage(
	body: Record<string, unknown>,
): Promise<Record<string, unknown> | undefined> {
	try {
		// The validator is callback-based, so we wrap it in a Promise to use await.
		return await new Promise<Record<string, unknown>>((resolve, reject) => {
			validator.validate(body, (err, validated) => {
				// The types mark `validated` optional, but it's always supplied alongside a null err.
				if (err || !validated) reject(err ?? new Error('No validated message returned.'));
				else resolve(validated);
			});
		});
	} catch (err: unknown) {
		const msg = jsutil.getErrorMessage(err);
		// This likely means a hacker is trying to spoof a request
		logEvents(
			`[AWS WEBHOOK] Signature Verification Failed! Is this a hacker? Error: ${msg}`,
			'awsNotifications',
		);
		return undefined;
	}
}

/**
 * GETs the URL SNS supplied, proving to Amazon that we own this endpoint.
 * Returns whether it succeeded.
 */
async function confirmSubscription(subscribeUrl: string): Promise<boolean> {
	logEventsAndPrint('[AWS WEBHOOK] Verifying subscription...', 'awsNotifications');
	try {
		await fetch(subscribeUrl);
		logEventsAndPrint('[AWS WEBHOOK] Subscription Confirmed!', 'awsNotifications');
		return true;
	} catch (err: unknown) {
		const msg = jsutil.getErrorMessage(err);
		logEventsAndPrint(`[AWS WEBHOOK] Confirmation failed: ${msg}`, 'errLog');
		return false;
	}
}

/**
 * Acts on the SES notification JSON that SNS nests inside its `Message` string.
 * A malformed message is logged and dropped, since a retry would fail identically.
 * @param snsMessage - The raw `Message` string off the SNS envelope.
 */
function processNotification(snsMessage: unknown): void {
	// Log entire message so we can learn unexpected structures
	logEvents(
		`[AWS WEBHOOK] Received Notification: ${escapeLogNewlines(String(snsMessage))}`,
		'awsNotifications',
	);

	let unvalidatedJson: unknown;
	try {
		unvalidatedJson = JSON.parse(String(snsMessage));
	} catch (err: unknown) {
		const msg = jsutil.getErrorMessage(err);
		logEventsAndPrint(`[AWS WEBHOOK] JSON Parse Error: ${msg}`, 'errLog');
		return;
	}

	const parseResult = SesNotificationSchema.safeParse(unvalidatedJson);
	if (!parseResult.success) {
		logZodError(
			unvalidatedJson,
			parseResult.error,
			'[AWS WEBHOOK] Malformed SES notification.',
		);
		return;
	}
	const notification = parseResult.data;

	switch (notification.notificationType) {
		// Successful hand-off to the recipient's mail server
		case 'Delivery': {
			const { recipients } = notification.delivery;
			logEvents(
				`[AWS WEBHOOK] Delivery: ${recipients.join(', ')} (${notification.mail.messageId})`,
				'awsNotifications',
			);
			break;
		}
		case 'Bounce': {
			const { bounceType, bouncedRecipients } = notification.bounce;
			// We strictly ban Permanent bounces (User Unknown, etc). Transient bounces
			// (Mailbox Full) are usually safe to retry later, so we leave them alone.
			if (bounceType === 'Permanent') blacklistRecipients(bouncedRecipients);
			else
				logEvents(
					`[AWS WEBHOOK] Bounce Type is not Permanent. No action taken: ${escapeLogNewlines(bounceType)}`, // prettier-ignore
					'awsNotifications',
				);
			break;
		}
		// Spam reports. We don't blacklist on these, since every email we send is
		// transactional — never strand a real user from account-recovery emails.
		case 'Complaint':
			for (const { emailAddress } of notification.complaint.complainedRecipients) {
				logEvents(
					`[AWS WEBHOOK] Complaint: ${escapeLogNewlines(emailAddress)}`,
					'awsNotifications',
				);
			}
			break;
	}
}

/** Bans every hard-bounced recipient from receiving any future email from us. */
function blacklistRecipients(recipients: Recipients): void {
	for (const { emailAddress } of recipients) {
		logEvents(
			`[AWS WEBHOOK] Hard Bounce: ${escapeLogNewlines(emailAddress)}`,
			'awsNotifications',
		);
		try {
			addToBlacklist(emailAddress, 'bounce');
		} catch {
			// Already logged
		}
	}
}
