// src/server/utility/emailService.ts

/**
 * Constructs and dispatches the application's transactional emails, handing each to
 * `mailer.ts` for delivery.
 *
 * Those addressed to a user — account verification, password reset, the password-changed
 * notice — are written here in that user's language. Those addressed to
 * Naviary — rating-abuse alerts, chat reports and database alerts — arrive as an alert
 * view already written in English, and all share one look.
 *
 * Blacklist screening is deliberately NOT done here: the flows where it matters gate at
 * their own entrance (accountValidation, passwordResetController), because only the
 * caller can shape the reply a blocked address gets; a check here could merely drop the
 * mail. Nothing else needs it — a member's own stored address, and our own, are never
 * screened.
 */

import type { AlertView } from './emailTemplates.js';
import type { AlertEmailType, Attachment } from './mailer.js';

import jsutil from '../../shared/util/jsutil.js';
import interpolate from '../../shared/util/interpolate.js';

import env from '../config/env.js';
import mailer from './mailer.js';
import urlUtils from './urlUtils.js';
import logEvents from './logEvents.js';
import emailTemplates from './emailTemplates.js';
import componentTranslationLoader from '../config/componentTranslationLoader.js';

// Email Senders ---------------------------------------------------------------

/**
 * Sends an account verification email.
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
		const baseUrl = urlUtils.getAppBase();
		const verificationUrl = new URL(`${baseUrl}/verify/${verificationToken}`).toString();

		const email = componentTranslationLoader.getScript('email', language);
		const t = email.verify;
		const { html, text } = emailTemplates.renderActionEmail({
			preheader: t.preheader,
			heading: interpolate.interpolate(t.heading, { username }),
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
		logEvents.addAndPrint(
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
		logEvents.addAndPrint(`Error sending password reset email: ${detail}`, 'errLog');
	}
}

/**
 * Sends an out-of-band security receipt notifying the user that their
 * account password was just changed (via the password reset flow).
 * @param language - The recipient's language code (`req.lang`).
 */
async function sendPasswordChangedEmail(recipientEmail: string, language: string): Promise<void> {
	const baseUrl = urlUtils.getAppBase();
	const forgotPassUrl = new URL(`${baseUrl}/forgot-password`).toString();

	try {
		const email = componentTranslationLoader.getScript('email', language);
		const t = email.reset_receipt;
		const { html, text } = emailTemplates.renderPasswordChangedEmail({
			preheader: t.preheader,
			heading: t.heading,
			body: t.body,
			warning: t.warning,
			resetLinkText: t.reset_link_text,
			resetUrl: forgotPassUrl,
			tagline: email.common.tagline,
		});
		await mailer.send('password-changed', {
			to: recipientEmail,
			subject: t.subject,
			html,
			text,
		});
	} catch (error: unknown) {
		const detail = jsutil.getErrorStack(error);
		logEvents.addAndPrint(
			`Error sending password changed email to ${recipientEmail}: ${detail}`,
			'errLog',
		);
	}
}

/** Renders an alert and sends it to our own infinite chess email address. */
async function sendAlertToSelf(
	type: AlertEmailType,
	view: AlertView,
	attachments?: Attachment[],
): Promise<void> {
	try {
		const sent = await mailer.send(type, {
			to: env.EMAIL_FROM_ADDRESS ?? '',
			subject: view.title,
			html: emailTemplates.renderAlertHtml(view),
			attachments,
		});
		if (!sent) console.log(`Didn't send ${type} email.`);
	} catch (error: unknown) {
		const detail = jsutil.getErrorStack(error);
		logEvents.addAndPrint(
			`Error during the sending of ${type} email with subject "${view.title}": ${detail}`,
			'errLog',
		);
	}
}

// Exports ---------------------------------------------------------------------

export default {
	sendEmailConfirmation,
	sendPasswordResetEmail,
	sendPasswordChangedEmail,
	sendAlertToSelf,
};
