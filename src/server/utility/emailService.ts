// src/server/utility/emailService.ts

/**
 * This module constructs and dispatches application emails:
 * account verification, password resets, and rating abuse alerts.
 */

import jsutil from '../../shared/util/jsutil.js';
import { interpolate } from '../../shared/util/interpolate.js';

import mailer from './mailer.js';
import emailTemplates from './emailTemplates.js';
import blacklistManager from '../database/blacklistManager.js';
import { getAppBaseUrl } from './urlUtils.js';
import { logEventsAndPrint } from './logEvents.js';
import componentTranslationLoader from '../config/componentTranslationLoader.js';

// Email Senders -----------------------------------------------------------------------------------

/**
 * Sends an account verification email, IF the recipient is not blacklisted.
 * The link points at the verify endpoint that promotes the pending registration.
 * @param recipientEmail - The recipient's email address, in LOWERCASE.
 * @param username - The username to be shown in the email body.
 * @param verificationToken - The secret to be embedded in the verification link.
 * @param language - The recipient's language code (`req.lang`).
 */
async function sendEmailConfirmation(
	recipientEmail: string,
	username: string,
	verificationToken: string,
	language: string,
): Promise<void> {
	try {
		if (blacklistManager.isBlacklisted(recipientEmail)) {
			logEventsAndPrint(
				`[BLOCKED] Skipping email confirmation to ${recipientEmail} (Blacklisted)`,
				'blacklistLog',
			);
			return;
		}

		const baseUrl = getAppBaseUrl();
		const verificationUrl = new URL(`${baseUrl}/verify/${verificationToken}`).toString();

		const email = componentTranslationLoader.getScript('email', language);
		const t = email.verify;
		const { html, text } = emailTemplates.renderActionEmail({
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

		if (!sent) console.log(`Verification Link: ${verificationUrl}`);
	} catch (error: unknown) {
		const detail = jsutil.getErrorStack(error);
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
async function sendPasswordResetEmail(
	recipientEmail: string,
	resetUrl: string,
	language: string,
): Promise<void> {
	try {
		const email = componentTranslationLoader.getScript('email', language);
		const t = email.reset;
		const { html, text } = emailTemplates.renderActionEmail({
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
		if (!sent) console.log(`Password Reset Link: ${resetUrl}`);
	} catch (error: unknown) {
		const detail = jsutil.getErrorStack(error);
		logEventsAndPrint(`Error sending password reset email: ${detail}`, 'errLog');
	}
}

/**
 * Sends an out-of-band security receipt notifying the user that their
 * account password was just changed (via the password reset flow).
 * @param language - The recipient's language code (`req.lang`).
 */
async function sendPasswordChangedEmail(recipientEmail: string, language: string): Promise<void> {
	const baseUrl = getAppBaseUrl();
	const forgotPassUrl = new URL(`${baseUrl}/forgot-password`).toString();

	try {
		const email = componentTranslationLoader.getScript('email', language);
		const t = email.reset_receipt;
		const resetLink = `<a href="${forgotPassUrl}" target="_blank" style="color:${emailTemplates.ACCENT_COLOR};text-decoration:underline;">${t.reset_link_text}</a>`;
		await mailer.send('password-changed', {
			to: recipientEmail,
			subject: t.subject,
			html: emailTemplates.buildReceiptEmailHtml({
				preheader: t.preheader,
				heading: t.heading,
				body: t.body,
				warning: interpolate(t.warning, { resetLink }),
				tagline: email.common.tagline,
			}),
			// Plain text: the warning's link becomes its bare label, with the URL on its own line.
			text: emailTemplates.buildPlainText([
				t.heading,
				t.body,
				interpolate(t.warning, { resetLink: t.reset_link_text }),
				forgotPassUrl,
			]),
		});
	} catch (error: unknown) {
		const detail = jsutil.getErrorStack(error);
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
			to: mailer.EMAIL_FROM_ADDRESS ?? '',
			subject: messageSubject,
			text: messageText,
		});
		if (!sent) console.log("Didn't send rating abuse email.");
	} catch (error: unknown) {
		const detail = jsutil.getErrorStack(error);
		logEventsAndPrint(
			`Error during the sending of rating abuse email with subject "${messageSubject}": ${detail}`,
			'errLog',
		);
	}
}

// Exports ------------------------------------------------------------------------------------------

export default {
	sendEmailConfirmation,
	sendPasswordResetEmail,
	sendPasswordChangedEmail,
	sendRatingAbuseEmail,
};
