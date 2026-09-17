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
import type { AlertLine, AlertRow, AlertSection, AlertView } from '../../utility/emailTemplates.js';

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

/** The whole report: the alert it's emailed as, plus the parts its log line names. */
interface ReportView extends AlertView {
	/** The reason's label. */
	reason: string;
	/** Who sent the report, as {@link describePlayer} renders them. */
	reporter: string;
	/** Who they reported, rendered alike. */
	reported: string;
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

// Submission ------------------------------------------------------------------

/** Delivers a report: one summarised line to `chatReportLog`, then the full evidence by email. */
function submit(report: ChatReport): void {
	const view = buildView(report);

	// Logged first: the append is local and instant, while the email can hang on SES.
	void logEvents.add(buildLogLine(report.game_id, view), 'chatReportLog');

	const attachment = {
		filename: `chat-report-${report.game_id}.txt`,
		content: emailTemplates.renderAlertText(view),
	};
	void emailService.sendAlertToSelf('chat-report', view, [attachment]);
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

	const reporter = describePlayer(report, reporterRole, userIds, sharedT);
	const reported = describePlayer(report, reportedRole, userIds, sharedT);

	const sections: AlertSection[] = [
		{ kind: 'rows', rows: [{ label: 'Sent', value: emailTemplates.formatMoment(Date.now()) }] },
		{ heading: 'REPORTER', kind: 'rows', rows: buildPlayerRows(reporter, userIds[reporterRole], false) }, // prettier-ignore
		{ heading: 'REPORTED PLAYER', kind: 'rows', rows: buildPlayerRows(reported, userIds[reportedRole], true) }, // prettier-ignore
		{ heading: 'GAME', kind: 'rows', rows: buildGameRows(report, sharedT) },
		{ heading: 'CHAT — as the reporter saw it', kind: 'mono', lines: buildTranscript(report, sharedT) }, // prettier-ignore
	];

	const reason = REPORT_REASONS.find((r) => r.code === report.reason)!.label;
	return { title: `Chat Report: ${reason}`, reason, reporter, reported, sections };
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

/** One person, as `Naviary (1237859) · White`, or `(Guest) · Black` for a guest. */
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

/**
 * One player's block: who they are, and what their account shows.
 * A guest, or an account deleted since, has no members row, so gets only the Player row.
 * @param player - As {@link describePlayer} renders them.
 * @param isReported - Whether they're the reported player, whose email and last visit are shown too.
 */
function buildPlayerRows(
	player: string,
	user_id: number | undefined,
	isReported: boolean,
): AlertRow[] {
	const nameOnly: AlertRow[] = [{ label: 'Player', value: player }];
	if (user_id === undefined) return nameOnly;
	const member = memberManager.getDataByCriteria(['username', 'email', 'joined', 'last_seen'], 'user_id', user_id); // prettier-ignore
	if (member === undefined) return nameOnly;

	const playerRow = { label: 'Player', value: player, link: urlUtils.getAbsoluteMemberUrl(member.username) }; // prettier-ignore
	const joinedRow = { label: 'Joined', value: emailTemplates.formatDayWithAge(timeutil.sqliteToTimestamp(member.joined)) }; // prettier-ignore
	const gamesRow = { label: 'Games', value: String(playerStatsManager.getUnabortedGameCount(user_id)!) }; // prettier-ignore
	if (!isReported) return [playerRow, joinedRow, gamesRow];

	const emailRow = { label: 'Email', value: member.email };
	const lastSeenRow = { label: 'Last seen', value: emailTemplates.formatMomentWithAge(timeutil.sqliteToTimestamp(member.last_seen)) }; // prettier-ignore
	return [playerRow, emailRow, joinedRow, gamesRow, lastSeenRow];
}

/** The game's own properties. Every one is knowable live AND dead, so nothing here branches on that. */
function buildGameRows(report: ChatReport, sharedT: ScriptTranslations['shared']): AlertRow[] {
	const { game_id, resolved, reporterRole } = report;
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
		{ label: 'Game id', value: String(game_id), link: urlUtils.getAbsoluteGameUrl(game_id, reporterRole) }, // prettier-ignore
		{ label: 'Played', value: emailTemplates.formatMomentWithAge(setup.timeCreated) },
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
 * The chat from the reporter's point of view, so "You" throughout means the reporter.
 * Notices are kept: abuse usually follows a declined draw or a disconnect.
 */
function buildTranscript(report: ChatReport, sharedT: ScriptTranslations['shared']): AlertLine[] {
	const { reporterRole } = report;
	const names = gameStateBuilder.resolvePlayerNames(report.resolved.state, reporterRole, sharedT);
	return report.entries.map((record, i): AlertLine => {
		const entry = chatEntryMapper.toEntry(record, i);
		const parts = chatentry.toParts(entry, reporterRole, names);
		const time = format(record.sent_at, 'HH:mm:ss');
		// Marked in the text itself, so the notice stands out in the `.txt` too.
		if (parts.cssClass === 'chat-notice')
			return { text: `${time}  — ${parts.body} —`, tone: 'muted' };
		const tone = entry.player === reporterRole ? 'blue' : 'red';
		return { text: `${time}  ${parts.prefix}${parts.body}`, tone };
	});
}

// The Log Line ----------------------------------------------------------------

/**
 * The report as one line: game id, reporter, reported, reason. Deliberately no transcript —
 * `chatReportLog` never rotates, so a multi-line entry would blur where each report ends.
 */
function buildLogLine(game_id: number, view: ReportView): string {
	return `Game ${game_id} | By ${view.reporter} | Against ${view.reported} | ${view.reason}`;
}

// Exports ---------------------------------------------------------------------

export default {
	// Constants
	REPORT_REASONS,
	// Submission
	submit,
};
