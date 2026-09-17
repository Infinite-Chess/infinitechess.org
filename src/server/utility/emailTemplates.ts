// src/server/utility/emailTemplates.ts

/**
 * Renders application emails into HTML and plain-text. The presentation layer behind
 * emailService: user-facing emails from already-resolved, localized content on the
 * on-brand layout, and alerts to ourselves from an {@link AlertView}.
 */

import { format, formatDistanceToNowStrict } from 'date-fns';

import interpolate from '../../shared/util/interpolate.js';

import nunjucks from '../config/nunjucks.js';

// Types -----------------------------------------------------------------------

// --- User Emails ---

/** Content every user-facing email has. */
interface UserEmailContent {
	/** Inbox preview text, hidden in the body. */
	preheader: string;
	heading: string;
	/** Shown in the footer, after the site name. */
	tagline: string;
}

/** Content for an action email (verification, password reset). */
interface ActionEmailContent extends UserEmailContent {
	intro: string;
	buttonLabel: string;
	url: string;
	fallbackText: string;
	footnote: string;
}

/** Content for the password-changed security receipt. */
interface PasswordChangedEmailContent extends UserEmailContent {
	body: string;
	/** Contains a `{resetLink}` placeholder, filled by a link labelled `resetLinkText` to `resetUrl`. */
	warning: string;
	resetLinkText: string;
	resetUrl: string;
}

/** A user-facing email, rendered. */
interface RenderedEmail {
	html: string;
	/** The plain-text alternative, for clients that don't render HTML. */
	text: string;
}

// --- Alert Emails ---

/** An alert emailed to ourselves. */
export interface AlertView {
	/** Also the email's subject. */
	title: string;
	sections: AlertSection[];
}

/**
 * One group of an alert: label/value rows, a table with column headers,
 * or a monospace block of lines.
 */
export type AlertSection = {
	heading?: string;
} & (
	| { kind: 'rows'; rows: AlertRow[] }
	| { kind: 'table'; columns: string[]; rows: AlertCell[][] }
	| { kind: 'mono'; lines: AlertLine[] }
);

/** One `label  value` row of an alert. */
export interface AlertRow extends AlertCell {
	label: string;
}

/** One value of an alert, optionally linked. */
export interface AlertCell {
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

/** Sign-off appended to every email's plain-text alternative. */
const SIGNATURE = '— InfiniteChess.org';

// User Emails -----------------------------------------------------------------

/** Renders an action email (verification, password reset) in both HTML and plain-text. */
function renderActionEmail(opts: ActionEmailContent): RenderedEmail {
	return {
		html: nunjucks.render('emails/user/action.njk', opts),
		text: buildPlainText([opts.heading, opts.intro, opts.url, opts.footnote]),
	};
}

/** Renders the password-changed security receipt in both HTML and plain-text. */
function renderPasswordChangedEmail(opts: PasswordChangedEmailContent): RenderedEmail {
	return {
		html: nunjucks.render('emails/user/password-changed.njk', opts),
		// The warning's link becomes its bare label, with the URL on its own line.
		text: buildPlainText([
			opts.heading,
			opts.body,
			interpolate.interpolate(opts.warning, { resetLink: opts.resetLinkText }),
			opts.resetUrl,
		]),
	};
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

// Alert Emails ----------------------------------------------------------------

/** Renders an alert as HTML. */
function renderAlertHtml(view: AlertView): string {
	return nunjucks.render('emails/alert.njk', view);
}

/** Renders an alert as plain text. */
function renderAlertText(view: AlertView): string {
	const blocks = view.sections.map((section) => {
		const body = buildAlertTextBody(section);
		return section.heading !== undefined ? `${section.heading}\n${body}` : body;
	});
	return [view.title, ...blocks].join('\n\n');
}

/** One section's body as plain text, without its heading. */
function buildAlertTextBody(section: AlertSection): string {
	switch (section.kind) {
		case 'rows':
			return alignTextColumns(section.rows.map((row) => [row.label, cellToText(row)]));
		case 'table':
			return alignTextColumns([
				section.columns,
				...section.rows.map((cells) => cells.map((cell) => cellToText(cell))),
			]);
		case 'mono':
			return section.lines.map((line) => line.text).join('\n');
	}
}

/** A cell as plain text, its link spelled out beside the value. */
function cellToText(cell: AlertCell): string {
	return cell.link ? `${cell.value}  ${cell.link}` : cell.value;
}

/** Joins lines of cells, padding every column but the last so the next one lines up. */
function alignTextColumns(lines: string[][]): string {
	const widths = lines[0]!.map((_, i) => Math.max(...lines.map((cells) => cells[i]!.length)));
	return lines
		.map((cells) =>
			cells
				.map((cell, i) => (i < cells.length - 1 ? cell.padEnd(widths[i]! + 2) : cell))
				.join(''),
		)
		.join('\n');
}

/** A raw timestamp as a date and time a human reads — no database value ever reaches an alert. */
function formatMoment(timestamp: number): string {
	return format(timestamp, 'MMM d, yyyy, h:mm a');
}

/** A past timestamp as a date and time, followed by how long ago it was: `Sep 16, 2026, 3:50 PM (3 minutes ago)`. */
function formatMomentWithAge(timestamp: number): string {
	return `${formatMoment(timestamp)} (${formatDistanceToNowStrict(timestamp)} ago)`;
}

/** A past timestamp as its day, followed by how many whole days ago it was: `Sep 14, 2026 (2 days ago)`. */
function formatDayWithAge(timestamp: number): string {
	const age = formatDistanceToNowStrict(timestamp, { unit: 'day', roundingMethod: 'floor' });
	return `${format(timestamp, 'MMM d, yyyy')} (${age} ago)`;
}

// Exports ---------------------------------------------------------------------

export default {
	// User Emails
	renderActionEmail,
	renderPasswordChangedEmail,
	// Alert Emails
	renderAlertHtml,
	renderAlertText,
	formatMoment,
	formatMomentWithAge,
	formatDayWithAge,
};
