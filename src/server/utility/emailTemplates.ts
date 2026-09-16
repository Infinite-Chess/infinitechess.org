// src/server/utility/emailTemplates.ts

/**
 * Renders application emails into HTML and plain-text. The presentation layer behind
 * emailService: user-facing emails from already-resolved, localized content on the
 * on-brand layout, and alerts to ourselves from an {@link AlertView}.
 */

import nunjucks from '../config/nunjucks.js';

// Types -----------------------------------------------------------------------

// --- User Emails ---

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

// --- Alert Emails ---

/** An alert emailed to ourselves. */
export interface AlertView {
	/** Also the email's subject. */
	title: string;
	sections: AlertSection[];
}

/** One group of an alert: label/value rows, or a monospace block of lines. */
export type AlertSection = {
	heading?: string;
} & ({ kind: 'rows'; rows: AlertRow[] } | { kind: 'mono'; lines: AlertLine[] });

/** One `label  value` row of an alert. */
export interface AlertRow {
	label: string;
	value: string;
	/** A URL the value links to, shown as `[open]` beside it. */
	link?: string;
}

/** One line of an alert's monospace block. */
export interface AlertLine {
	text: string;
	/** The color it's drawn in. Plain when absent. */
	tone?: 'muted' | 'blue' | 'red';
}

// Constants -------------------------------------------------------------------

/** Header, button and link accent color: a dark neutral grey. */
const ACCENT_COLOR = '#383838';
/** Page background behind the email card: a warm off-white. */
const PAGE_BG_COLOR = '#f1eeea';
/** Sign-off appended to every email's plain-text alternative. */
const SIGNATURE = '— InfiniteChess.org';

// User Emails -----------------------------------------------------------------

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

// Alert Emails ----------------------------------------------------------------

/** Renders an alert as HTML. */
function renderAlertHtml(view: AlertView): string {
	return nunjucks.render('emails/alert.njk', view);
}

/** Renders an alert as plain text. */
function renderAlertText(view: AlertView): string {
	const blocks = view.sections.map((section) => {
		const body =
			section.kind === 'rows'
				? buildAlertTextRows(section.rows)
				: section.lines.map((line) => line.text).join('\n');
		return section.heading !== undefined ? `${section.heading}\n${body}` : body;
	});
	return [view.title, ...blocks].join('\n\n');
}

/** One group of `label  value` lines, the labels padded so the values form a column. */
function buildAlertTextRows(rows: AlertRow[]): string {
	const labelWidth = Math.max(...rows.map((row) => row.label.length)) + 2;
	return rows
		.map((row) => {
			const value = row.link ? `${row.value}  ${row.link}` : row.value;
			return `${row.label.padEnd(labelWidth)}${value}`;
		})
		.join('\n');
}

// Exports ---------------------------------------------------------------------

export default {
	// Constants
	ACCENT_COLOR,
	// User Emails
	buildReceiptEmailHtml,
	buildPlainText,
	renderActionEmail,
	// Alert Emails
	renderAlertHtml,
	renderAlertText,
};
