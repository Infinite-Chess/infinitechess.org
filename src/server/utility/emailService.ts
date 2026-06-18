// src/server/utility/emailService.ts

/*
 * This module constructs and dispatches application emails:
 * account verification, password resets, and rating abuse alerts.
 */

import { interpolate } from '../../shared/util/interpolate.js';

import mailer from './mailer.js';
import { getAppBaseUrl } from './urlUtils.js';
import { isBlacklisted } from '../database/blacklistManager.js';
import { logEventsAndPrint } from '../middleware/logEvents.js';
import { getScriptTranslations } from '../config/componentTranslationLoader.js';
import {
	EMAIL_ACCENT_COLOR,
	renderActionEmail,
	buildReceiptEmailHtml,
	buildPlainText,
} from './emailTemplates.js';

// Email Senders ---------------------------------------------

/**
 * Sends an account verification email, IF the recipient is not blacklisted.
 * The link points at the verify endpoint that promotes the pending registration.
 * @param recipientEmail - The recipient's email address, in LOWERCASE.
 * @param username - The username to be shown in the email body.
 * @param verificationToken - The secret to be embedded in the verification link.
 * @param language - The recipient's language code (`req.lang`).
 */
export async function sendEmailConfirmation(
	recipientEmail: string,
	username: string,
	verificationToken: string,
	language: string,
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

		const email = getScriptTranslations('email', language);
		const t = email.verify;
		const { html, text } = renderActionEmail({
			preheader: t.preheader,
			heading: interpolate(t.heading, { username }),
			intro: t.intro,
			buttonLabel: t.button,
			url: verificationUrl,
			fallbackText: email.common.button_fallback,
			footnote: t.footnote,
			tagline: email.common.tagline,
		});
		const sent = await mailer.send('registration', {
			to: recipientEmail,
			subject: t.subject,
			html,
			text,
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

/**
 * Sends a password-reset email with a link to choose a new password.
 * @param language - The recipient's language code (`req.lang`).
 */
export async function sendPasswordResetEmail(
	recipientEmail: string,
	resetUrl: string,
	language: string,
): Promise<void> {
	try {
		const email = getScriptTranslations('email', language);
		const t = email.reset;
		const { html, text } = renderActionEmail({
			preheader: t.preheader,
			heading: t.heading,
			intro: t.intro,
			buttonLabel: t.button,
			url: resetUrl,
			fallbackText: email.common.button_fallback,
			footnote: t.footnote,
			tagline: email.common.tagline,
		});
		const sent = await mailer.send('password-reset', {
			to: recipientEmail,
			subject: t.subject,
			html,
			text,
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
 * @param language - The recipient's language code (`req.lang`).
 */
export async function sendPasswordChangedEmail(
	recipientEmail: string,
	language: string,
): Promise<void> {
	const baseUrl = getAppBaseUrl();
	const forgotPassUrl = new URL(`${baseUrl}/forgot-password`).toString();

	try {
		const email = getScriptTranslations('email', language);
		const t = email.reset_receipt;
		const resetLink = `<a href="${forgotPassUrl}" target="_blank" style="color:${EMAIL_ACCENT_COLOR};text-decoration:underline;">${t.reset_link_text}</a>`;
		await mailer.send('password-changed', {
			to: recipientEmail,
			subject: t.subject,
			html: buildReceiptEmailHtml({
				preheader: t.preheader,
				heading: t.heading,
				body: t.body,
				warning: interpolate(t.warning, { resetLink }),
				tagline: email.common.tagline,
			}),
			// Plain text: the warning's link becomes its bare label, with the URL on its own line.
			text: buildPlainText([
				t.heading,
				t.body,
				interpolate(t.warning, { resetLink: t.reset_link_text }),
				forgotPassUrl,
			]),
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
export async function sendRatingAbuseEmail(
	messageSubject: string,
	messageText: string,
): Promise<void> {
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
