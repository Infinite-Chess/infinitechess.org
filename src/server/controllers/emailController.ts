// src/server/controllers/emailController.ts

/*
 * This module constructs and dispatches application emails:
 * password resets, account verification, and rating abuse alerts.
 */

import { interpolate } from '../../shared/util/interpolate.js';

import mailer from '../utility/mailer.js';
import { getAppBaseUrl } from '../utility/urlUtils.js';
import { isBlacklisted } from '../database/blacklistManager.js';
import { logEventsAndPrint } from '../middleware/logEvents.js';
import { getScriptTranslations } from '../config/componentTranslationLoader.js';

// Types --------------------------------------------------------

/** Content for an action email (verification, password reset) */
type ActionEmailContent = {
	preheader: string;
	heading: string;
	intro: string;
	buttonLabel: string;
	url: string;
	fallbackText: string;
	footnote: string;
	tagline: string;
};

// Constants ---------------------------------------------

/** Header/button accent color: a dark neutral grey. */
const ACCENT_COLOR = '#383838';
/** Page background behind the email card: a warm off-white. */
const PAGE_BG_COLOR = '#f4f1ea';
/** Sign-off appended to every email's plain-text alternative. */
const SIGNATURE = '— InfiniteChess.org';

// Helper Functions ---------------------------------------------

/**
 * Wraps body content in the shared, on-brand email layout: off-white page,
 * dark accent header with branding, white body card, and footer.
 * @param preheader - Inbox preview text, hidden in the rendered body.
 * @param tagline - Localized footer tagline shown after the wordmark.
 * @param bodyHtml - The email-specific content placed inside the white body card.
 */
function buildEmailShell(preheader: string, tagline: string, bodyHtml: string): string {
	return `
		<!-- Preheader: inbox preview text, hidden in the body. -->
		<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${preheader}</div>
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
								${bodyHtml}
							</td>
						</tr>
						<!-- Footer -->
						<tr>
							<td align="center" style="padding:24px 24px 8px;">
								<p style="margin:0;color:#999999;font-size:12px;line-height:1.6;">InfiniteChess.org &mdash; ${tagline}</p>
							</td>
						</tr>
					</table>
				</td>
			</tr>
		</table>
	`;
}

/**
 * Builds an action email — heading, intro line, prominent button, fallback link,
 * and footnote — on the shared shell. Used by the verification & password-reset emails.
 */
function buildActionEmailHtml(opts: ActionEmailContent): string {
	const body = `
		<h1 style="margin:0 0 16px;color:#1e1e1e;font-size:24px;font-weight:bold;">${opts.heading}</h1>
		<p style="margin:0 0 28px;color:#444444;font-size:16px;line-height:1.6;">${opts.intro}</p>
		<!-- Bulletproof button -->
		<table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 28px;">
			<tr>
				<td bgcolor="${ACCENT_COLOR}" style="border-radius:6px;">
					<a href="${opts.url}" target="_blank" style="display:inline-block;padding:14px 36px;color:#ffffff;font-size:16px;font-weight:bold;text-decoration:none;">${opts.buttonLabel}</a>
				</td>
			</tr>
		</table>
		<p style="margin:0 0 8px;color:#777777;font-size:13px;line-height:1.6;">${opts.fallbackText}</p>
		<p style="margin:0 0 24px;font-size:13px;line-height:1.6;word-break:break-all;"><a href="${opts.url}" target="_blank" style="color:${ACCENT_COLOR};text-decoration:underline;">${opts.url}</a></p>
		<p style="margin:0;color:#999999;font-size:13px;line-height:1.6;">${opts.footnote}</p>
	`;
	return buildEmailShell(opts.preheader, opts.tagline, body);
}

/**
 * Builds the HTML for the password-changed security receipt — heading, confirmation
 * line, and a warning whose `{resetLink}` placeholder is already resolved to an anchor.
 */
function buildReceiptEmailHtml(opts: {
	preheader: string;
	heading: string;
	body: string;
	warning: string;
	tagline: string;
}): string {
	const body = `
		<h1 style="margin:0 0 16px;color:#1e1e1e;font-size:24px;font-weight:bold;">${opts.heading}</h1>
		<p style="margin:0 0 16px;color:#444444;font-size:16px;line-height:1.6;">${opts.body}</p>
		<p style="margin:0;color:#777777;font-size:13px;line-height:1.6;">${opts.warning}</p>
	`;
	return buildEmailShell(opts.preheader, opts.tagline, body);
}

/**
 * Builds an email's plain-text alternative from its content blocks, joined by blank lines
 * with the signature appended. Inline tags are stripped so HTML emphasis doesn't leak in.
 */
function buildPlainText(blocks: string[]): string {
	return stripInlineTags([...blocks, SIGNATURE].join('\n\n'));
}

/** Strips the inline tags translation strings may contain (`<br>` → newline, others removed). */
function stripInlineTags(html: string): string {
	return html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '');
}

/** Renders an action email (verification, password reset) in both HTML and plain-text. */
function renderActionEmail(opts: ActionEmailContent): { html: string; text: string } {
	return {
		html: buildActionEmailHtml(opts),
		text: buildPlainText([opts.heading, opts.intro, opts.url, opts.footnote]),
	};
}

// Email Senders ---------------------------------------------

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
async function sendPasswordResetEmail(
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
async function sendPasswordChangedEmail(recipientEmail: string, language: string): Promise<void> {
	const baseUrl = getAppBaseUrl();
	const forgotPassUrl = new URL(`${baseUrl}/forgot-password`).toString();

	try {
		const email = getScriptTranslations('email', language);
		const t = email.reset_receipt;
		const resetLink = `<a href="${forgotPassUrl}" target="_blank" style="color:${ACCENT_COLOR};text-decoration:underline;">${t.reset_link_text}</a>`;
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
