// src/server/game/gamemanager/chatReport.ts

/**
 * Renders a report of a game chat: the reason list the whole system is built from, and
 * the log line and email one report becomes.
 *
 * The only place a report becomes words — edit the wording here. Nothing is stored:
 * the log line is the tally, and the inbox is the queue.
 */

import type { ResolvedGameState } from './gameManager.js';
import type { ChatEntriesRecord } from '../../database/chatEntriesManager.js';
import type { ScriptTranslations } from '../../../shared/types/script-translations.js';
import type { Player, PlayerGroup } from '../../../shared/chess/util/typeutil.js';

import { format } from 'date-fns';

import timeutil from '../../../shared/util/timeutil.js';
import typeutil from '../../../shared/chess/util/typeutil.js';
import chatentry from '../../../shared/components/chatentry.js';
import clockutil from '../../../shared/chess/util/clockutil.js';

import tconfig from '../../config/translationConfig.js';
import urlUtils from '../../utility/urlUtils.js';
import logEvents from '../../utility/logEvents.js';
import emailService from '../../utility/emailService.js';
import gamesManager from '../../database/gamesManager.js';
import memberManager from '../../database/memberManager.js';
import emailTemplates from '../../utility/emailTemplates.js';
import chatEntryMapper from './chatEntryMapper.js';
import gameStateBuilder from './gameStateBuilder.js';
import playerStatsManager from '../../database/playerStatsManager.js';
import playerGamesManager from '../../database/playerGamesManager.js';
import componentTranslationLoader from '../../config/componentTranslationLoader.js';

// Types -----------------------------------------------------------------------

/** A reason a chat may be reported for, as it travels the wire. */
type ReportReasonCode = (typeof REPORT_REASONS)[number]['code'];

/** Everything one report is made of, gathered at the trust boundary before it comes in. */
interface ChatReport {
	/** Numeric, never base62 — the form `deletechat` takes. */
	game_id: number;
	reason: ReportReasonCode;
	/** The color the reporter played. The transcript is rendered from their side. */
	reporterRole: Player;
	/** The game, read from memory if it's still live and from the database if not. */
	resolved: ResolvedGameState;
	/**
	 * The whole chat log, copied rather than referenced: the rows can be deleted, and
	 * `message_id` values are reused afterwards.
	 */
	entries: ChatEntriesRecord[];
}

/** How far down a timestamp is carried in the report. */
type MomentPrecision = 'minute' | 'day';

/** One `label  value` line of the email. */
interface ReportRow {
	label: string;
	value: string;
	/** A URL the value links to, shown as `[open]` beside it. */
	link?: string;
}

/** One headed group of `label  value` lines. */
interface ReportSection {
	/** Absent on the opening group alone, which is read first under the report's own heading. */
	heading?: string;
	rows: ReportRow[];
}

/** What one line of the chat is: an event notice, or a message by one side of the report. */
type TranscriptLineKind = 'notice' | 'reporter' | 'reported';

/** One line of the chat. */
interface TranscriptLine {
	text: string;
	/** Decides the line's color in the HTML body. */
	kind: TranscriptLineKind;
}

/** The whole report, so the HTML body and the `.txt` attachment can never disagree. */
interface ReportView {
	/** The reason's label. */
	reason: string;
	sections: ReportSection[];
	/** The chat, timestamped to the second, as the reporter saw it. */
	transcript: TranscriptLine[];
}

// Constants -------------------------------------------------------------------

/**
 * Every reason the flag's menu offers, in the order it lists them. The single source of
 * both — the code rides the wire, the label heads the email — so neither can drift.
 */
const REPORT_REASONS = [
	{ code: 'harassment', label: 'Harassment or hate speech' },
	{ code: 'threats', label: 'Threats or violence' },
	{ code: 'sexual', label: 'Sexual content' },
	{ code: 'scam', label: 'Scam or phishing' },
	{ code: 'child-safety', label: 'Child safety' },
	{ code: 'other', label: 'Other' },
] as const;

/** Columns the label column of each `label  value` line is padded to in the plain-text report. */
const TEXT_LABEL_WIDTH = 14;

/** Heads the transcript, because "You" throughout it means the reporter. */
const TRANSCRIPT_HEADING = 'CHAT — as the reporter saw it';

/** The inline style each {@link TranscriptLineKind} is drawn with in the HTML body. */
const TRANSCRIPT_LINE_STYLES: Record<TranscriptLineKind, string> = {
	notice: 'color:#777777;font-style:italic;',
	reporter: 'color:#1f5fa8;',
	reported: 'color:#b3261e;',
};

/** The `date-fns` pattern each {@link MomentPrecision} prints a timestamp with. */
const MOMENT_FORMATS: Record<MomentPrecision, string> = {
	minute: 'd MMM yyyy, h:mm a',
	day: 'd MMM yyyy',
};

// Submission ------------------------------------------------------------------

/** Delivers a report: one summarised line to `chatReportLog`, then the full evidence by email. */
function submit(report: ChatReport): void {
	const view = buildView(report);

	// Logged first: the append is local and instant, while the email can hang on SES.
	void logEvents.add(buildLogLine(report.game_id, view), 'chatReportLog');

	const attachment = { filename: `chat-report-${report.game_id}.txt`, content: buildText(view) };
	void emailService.sendAlertToSelf('chat-report', {
		subject: buildTitle(view),
		html: buildHtml(view),
		attachments: [attachment],
	});
}

// Composition -----------------------------------------------------------------

/** Gathers every field of the report, resolved to the English a user would have seen. */
function buildView(report: ChatReport): ReportView {
	const { reporterRole } = report;
	// The report is read by Naviary alone, so it speaks the site's source language.
	const sharedT = componentTranslationLoader.getScript('shared', tconfig.DEFAULT_LANGUAGE);

	// Online games are strictly two-player, so the reported player is always the other one.
	const reportedRole = typeutil.invertPlayer(reporterRole);
	const userIds = resolveUserIds(report);
	const reportedId = userIds[reportedRole];

	const reporter = describePlayer(report, reporterRole, userIds, sharedT);
	const reported = describePlayer(report, reportedRole, userIds, sharedT);

	const sections: ReportSection[] = [
		// KEEP the two people first: `buildLogLine` reads them off by position.
		{
			rows: [
				{ label: 'Reported by', value: reporter },
				{ label: 'Reported', value: reported },
				{ label: 'Sent', value: formatMoment(Date.now()) },
			],
		},
		{ heading: 'GAME', rows: buildGameRows(report, sharedT) },
	];
	// A guest has no members row to read the block's fields from.
	const reportedRows = reportedId !== undefined ? buildReportedPlayerRows(reportedId) : undefined;
	if (reportedRows) sections.push({ heading: 'REPORTED PLAYER', rows: reportedRows });

	return {
		reason: REPORT_REASONS.find((r) => r.code === report.reason)!.label,
		sections,
		transcript: buildTranscript(report, sharedT),
	};
}

/** Each color's `user_id`. A guest has none; their `browser_id` is never shown, no command acts on one. */
function resolveUserIds(report: ChatReport): PlayerGroup<number> {
	const ids: PlayerGroup<number> = {};
	const { game } = report.resolved;
	if (game) {
		for (const [strColor, data] of Object.entries(game.match.playerData)) {
			if (data.identifier.signedIn) ids[Number(strColor) as Player] = data.identifier.user_id;
		}
	} else {
		const rows = playerGamesManager.getOfGame(report.game_id, ['player_number', 'user_id']);
		for (const row of rows) ids[row.player_number as Player] = row.user_id;
	}
	return ids;
}

/** One person, as `Naviary (12) · White`, or `(Guest) · Black` for a guest. */
function describePlayer(
	report: ChatReport,
	color: Player,
	userIds: PlayerGroup<number>,
	sharedT: ScriptTranslations['shared'],
): string {
	const username = report.resolved.state.players[color]!.username;
	const user_id = userIds[color];
	const identity = user_id !== undefined ? `${username} (${user_id})` : username;
	return `${identity} · ${sharedT.sides[typeutil.strcolors[color]]}`;
}

/** The game's own properties. Every one is knowable live AND dead, so nothing here branches on that. */
function buildGameRows(report: ChatReport, sharedT: ScriptTranslations['shared']): ReportRow[] {
	const { game_id, resolved } = report;
	const { setup } = resolved.state;
	const variant =
		setup.variant.kind === 'preset'
			? sharedT.variants[setup.variant.code]
			: sharedT.variant_groups.custom.display_label;
	// The page's label is blank when untimed, leaning on the infinity icon. Text has no icon.
	const timeControl = clockutil.isClockValueInfinite(setup.timeControl)
		? sharedT.speeds.infinite
		: clockutil.getTimeControlLabel(setup.timeControl);

	return [
		// Shown numeric, linked base62. A numeric id in the href wouldn't 404 — "193" is
		// itself valid base62, and would silently resolve to a different game.
		{ label: 'Game id', value: String(game_id), link: urlUtils.getAbsoluteGameUrl(game_id) },
		{ label: 'Played', value: formatMoment(setup.timeCreated) },
		{ label: 'Variant', value: variant },
		{
			label: 'Mode',
			value: resolved.state.rated ? sharedT.game_modes.rated : sharedT.game_modes.casual,
		},
		{ label: 'Time control', value: timeControl },
		{ label: 'Visibility', value: isGamePrivate(report) ? 'Private' : 'Public' },
	];
}

/** Whether the game was created from "Challenge a friend" rather than a public seek. */
function isGamePrivate(report: ChatReport): boolean {
	const { game } = report.resolved;
	if (game) return game.match.private;
	// The row is guaranteed — `resolved` was built from it.
	return gamesManager.getData(report.game_id, ['private'])!.private === 1;
}

/**
 * What is known about the reported member, to decide an action without opening another tab.
 * Undefined once their account is gone, leaving no members row to read.
 */
function buildReportedPlayerRows(user_id: number): ReportRow[] | undefined {
	const member = memberManager.getDataByCriteria(['joined', 'last_seen'], 'user_id', user_id);
	if (member === undefined) return undefined;
	const stats = playerStatsManager.getData(user_id, ['game_count', 'game_count_aborted'])!;

	return [
		{ label: 'Joined', value: formatMoment(timeutil.sqliteToTimestamp(member.joined), 'day') },
		{ label: 'Games', value: String(stats.game_count - stats.game_count_aborted) }, // Exclude aborted games
		{ label: 'Last seen', value: formatMoment(timeutil.sqliteToTimestamp(member.last_seen)) },
	];
}

/**
 * The chat from the reporter's point of view, so "You" throughout means the reporter.
 * Notices are kept: abuse usually follows a declined draw or a disconnect.
 */
function buildTranscript(
	report: ChatReport,
	sharedT: ScriptTranslations['shared'],
): TranscriptLine[] {
	const { reporterRole } = report;
	const names = gameStateBuilder.resolvePlayerNames(report.resolved.state, reporterRole, sharedT);
	return report.entries.map((record, i): TranscriptLine => {
		const entry = chatEntryMapper.toEntry(record, i);
		const parts = chatentry.toParts(entry, reporterRole, names);
		const time = format(record.sent_at, 'HH:mm:ss');
		// Marked in the text itself, so the notice stands out in the `.txt` too.
		if (parts.cssClass === 'chat-notice')
			return { text: `${time}  — ${parts.body} —`, kind: 'notice' };
		const kind = entry.player === reporterRole ? 'reporter' : 'reported';
		return { text: `${time}  ${parts.prefix}${parts.body}`, kind };
	});
}

/**
 * A raw timestamp as a date a human reads — no database value ever reaches the report.
 * @param precision - How far down to carry it.
 */
function formatMoment(timestamp: number, precision: MomentPrecision = 'minute'): string {
	return format(timestamp, MOMENT_FORMATS[precision]);
}

// The Log Line ----------------------------------------------------------------

/**
 * The report as one line: game id, reporter, reported, reason. Deliberately no transcript —
 * `chatReportLog` never rotates, so a multi-line entry would blur where each report ends.
 */
function buildLogLine(game_id: number, view: ReportView): string {
	const [reportedBy, reported] = view.sections[0]!.rows;
	return `Game ${game_id} | By ${reportedBy!.value} | Against ${reported!.value} | ${view.reason}`;
}

// The Title -------------------------------------------------------------------

/** The email's subject, and the heading of both its body and its attachment. */
function buildTitle(view: ReportView): string {
	return `Chat Report: ${view.reason}`;
}

// The HTML Body ---------------------------------------------------------------

/**
 * The report as styled HTML. Deliberately not on `emailTemplates.buildEmailShell`, whose
 * card is fixed at 600px — too narrow for a 140-character transcript line.
 */
function buildHtml(view: ReportView): string {
	const blocks = view.sections.map(
		(section) => `${buildHtmlHeading(section.heading)}${buildHtmlRows(section.rows)}`,
	);
	blocks.push(
		buildHtmlHeading(TRANSCRIPT_HEADING),
		`<pre style="margin:0;padding:14px 16px;background-color:#f4f2ef;border-radius:6px;font-family:Consolas,Menlo,monospace;font-size:13px;line-height:1.7;white-space:pre-wrap;">${view.transcript.map((line) => buildHtmlTranscriptLine(line)).join('\n')}</pre>`,
	);

	return `
		<div style="font-family:Arial,Helvetica,sans-serif;color:#1e1e1e;">
			<h1 style="margin:0 0 20px;font-size:24px;font-weight:bold;">${escapeHtml(buildTitle(view))}</h1>
			${blocks.join('\n')}
		</div>
	`;
}

/** A section heading, or nothing at all for the opening group, which has none. */
function buildHtmlHeading(text: string | undefined): string {
	if (text === undefined) return '';
	return `<h2 style="margin:28px 0 8px;color:#777777;font-size:12px;font-weight:bold;letter-spacing:0.08em;">${escapeHtml(text)}</h2>`;
}

/** One group of `label  value` lines as a two-column table. */
function buildHtmlRows(rows: ReportRow[]): string {
	const cells = rows.map((row) => {
		const link = row.link
			? ` <a href="${escapeHtml(row.link)}" style="color:${emailTemplates.ACCENT_COLOR};">[open]</a>`
			: '';
		return `<tr>
			<td style="padding:2px 18px 2px 0;color:#777777;font-size:14px;white-space:nowrap;vertical-align:top;">${escapeHtml(row.label)}</td>
			<td style="padding:2px 0;font-size:14px;">${escapeHtml(row.value)}${link}</td>
		</tr>`;
	});
	return `<table role="presentation" cellpadding="0" cellspacing="0" border="0">${cells.join('')}</table>`;
}

/** One line of the chat, colored by its kind. */
function buildHtmlTranscriptLine(line: TranscriptLine): string {
	return `<span style="${TRANSCRIPT_LINE_STYLES[line.kind]}">${escapeHtml(line.text)}</span>`;
}

/** Renders text inert as HTML. The transcript is user input and is never trusted. */
function escapeHtml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

// The Text Attachment ---------------------------------------------------------

/**
 * The whole report in plain text, to drop straight into an AI agent to judge. The full
 * report, not a bare chat dump — the agent needs the metadata as much as the messages.
 */
function buildText(view: ReportView): string {
	const blocks = view.sections.map((section) => {
		const rows = buildTextRows(section.rows);
		return section.heading !== undefined ? `${section.heading}\n${rows}` : rows;
	});
	const transcript = `${TRANSCRIPT_HEADING}\n${view.transcript.map((line) => line.text).join('\n')}`;
	return [buildTitle(view), ...blocks, transcript].join('\n\n');
}

/** One group of `label  value` lines, the labels padded so the values form a column. */
function buildTextRows(rows: ReportRow[]): string {
	return rows
		.map((row) => {
			const value = row.link ? `${row.value}  ${row.link}` : row.value;
			return `${row.label.padEnd(TEXT_LABEL_WIDTH)}${value}`;
		})
		.join('\n');
}

// Exports ---------------------------------------------------------------------

export default {
	// Constants
	REPORT_REASONS,
	// Submission
	submit,
};
