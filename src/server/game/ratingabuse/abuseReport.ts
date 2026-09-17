// src/server/game/ratingabuse/abuseReport.ts

/**
 * Renders a flagged rating-abuse measurement: the log line and email it becomes.
 *
 * The only place a measurement becomes words — edit the wording here.
 */

import type { Player } from '../../../shared/chess/util/typeutil.js';
import type { Condition } from '../../../shared/chess/util/winconutil.js';
import type { AlertSection, AlertView } from '../../utility/emailTemplates.js';
import type {
	AbuseEvidence,
	AbuseGameInfo,
	AbuseReportContext,
	SuspicionRecord,
	SuspicionVerdict,
} from './ratingAbuseTypes.js';

import { formatDistanceStrict } from 'date-fns';

import timeutil from '../../../shared/util/timeutil.js';
import clockutil from '../../../shared/chess/util/clockutil.js';
import winconutil from '../../../shared/chess/util/winconutil.js';
import metadatautil from '../../../shared/chess/util/metadatautil.js';

import urlUtils from '../../utility/urlUtils.js';
import logEvents from '../../utility/logEvents.js';
import abuseChecks from './abuseChecks.js';
import emailService from '../../utility/emailService.js';
import memberManager from '../../database/memberManager.js';
import emailTemplates from '../../utility/emailTemplates.js';
import playerStatsManager from '../../database/playerStatsManager.js';

// Types -----------------------------------------------------------------------

/** The whole report: the alert it's emailed as, plus the parts its log line names. */
interface AbuseView extends AlertView {
	/** The flagged player, as `Troll42 (2004411)`. */
	player: string;
	/** Their total suspicion weight, to two decimals. */
	suspicion: string;
	/** Their net rating change, as `+126 over 5 games`. */
	ratingChange: string;
}

// Constants -------------------------------------------------------------------

/** Each check's name, as the email lists it. */
const CHECK_LABELS = {
	think_time: 'Unused clock',
	same_opponents: 'Same opponents',
	ip_addresses: 'Shared IP address',
	logged_out: 'Logged out mid-game',
	opponent_account_age: 'New opponent accounts',
} as const satisfies Record<SuspicionRecord['category'], string>;

// Reports ---------------------------------------------------------------------

/** Delivers a flagged measurement: one summarised line to `ratingAbuseLog`, then the full evidence by email. */
function reportFlagged(ctx: AbuseReportContext, verdict: SuspicionVerdict): void {
	const view = buildView(ctx, verdict);

	void logEvents.add(buildLogLine(view), 'ratingAbuseLog');

	const attachment = {
		filename: `rating-abuse-${ctx.user_id}.txt`,
		content: emailTemplates.renderAlertText(view),
	};
	void emailService.sendAlertToSelf('rating-abuse-alert', view, [attachment]);
}

// The Email -------------------------------------------------------------------

/** A flagged measurement as the alert Naviary is emailed. */
function buildView(ctx: AbuseReportContext, verdict: SuspicionVerdict): AbuseView {
	const player = `${ctx.username} (${ctx.user_id})`;
	const suspicion = verdict.totalWeight.toFixed(2);
	const ratingChange = `${metadatautil.getWhiteBlackRatingDiff(ctx.netRatingChange)} over ${ctx.evidence.games.length} games`;
	const threshold = abuseChecks.SUSPICION_THRESHOLD.toFixed(1);
	// The account exists: the player has just finished a game.
	// Rated games are finalized immediately, no window for them to delete their account before the abuse check.
	const joined = memberManager.getDataByCriteria(['joined'], 'user_id', ctx.user_id)!.joined;
	const gameCount = playerStatsManager.getUnabortedGameCount(ctx.user_id)!;
	return {
		title: `Rating Abuse: ${ctx.username} (${suspicion})`,
		player,
		suspicion,
		ratingChange,
		sections: [
			{
				kind: 'rows',
				rows: [
					{ label: 'Sent', value: emailTemplates.formatMoment(Date.now()) },
					{ label: 'Player', value: player, link: urlUtils.getAbsoluteMemberUrl(ctx.username) }, // prettier-ignore
					{ label: 'Suspicion', value: `${suspicion} (flagged at ${threshold})` },
					{ label: 'Rating change', value: ratingChange },
					{ label: 'Time span', value: formatTimeSpan(ctx.evidence.games) },
					{ label: 'Joined', value: emailTemplates.formatDayWithAge(timeutil.sqliteToTimestamp(joined)) }, // prettier-ignore
					{ label: 'Games', value: String(gameCount) },
				],
			},
			{
				heading: 'WHY FLAGGED',
				kind: 'rows',
				rows: verdict.records.map((record) => ({
					label: CHECK_LABELS[record.category],
					value: `${record.weight.toFixed(2)} / ${abuseChecks.CHECK_MAX_WEIGHTS[record.category]}`,
				})),
			},
			buildGamesSection(ctx.evidence),
			buildOpponentsSection(ctx.evidence),
		],
	};
}

/** How long passed between the first and last of the games starting, like `58 minutes` or `3 days`. */
function formatTimeSpan(games: AbuseGameInfo[]): string {
	const starts = games.map((game) => timeutil.sqliteToTimestamp(game.date));
	return formatDistanceStrict(Math.min(...starts), Math.max(...starts));
}

/** The measured games, one row each, oldest first. */
function buildGamesSection(evidence: AbuseEvidence): AlertSection {
	const chronological = evidence.games.toSorted((a, b) => timeutil.sqliteToTimestamp(a.date) - timeutil.sqliteToTimestamp(b.date)); // prettier-ignore
	return {
		heading: 'GAMES',
		kind: 'table',
		columns: ['Game', 'Played', 'Opponent', 'Time control', 'Result', 'Rating', 'Moves', 'Ended by', 'Clock unused'], // prettier-ignore
		rows: chronological.map((game) => [
			{ value: String(game.game_id), link: urlUtils.getAbsoluteGameUrl(game.game_id, game.player_number as Player) }, // prettier-ignore
			{ value: emailTemplates.formatMoment(timeutil.sqliteToTimestamp(game.date)) },
			{ value: describeOpponent(evidence, game.game_id) },
			{ value: clockutil.getTimeControlLabel(clockutil.buildTimeControl(game.base_time_seconds, game.increment_seconds)) }, // prettier-ignore
			{ value: game.score === 1 ? 'Win' : game.score === 0 ? 'Loss' : 'Draw' },
			{ value: metadatautil.getWhiteBlackRatingDiff(game.elo_change_from_game!) },
			{ value: String(game.move_count) },
			// The termination column is plain TEXT.
			{ value: winconutil.getTerminationInEnglish(game.moveRule, game.termination as Condition) }, // prettier-ignore
			{ value: `${Math.round(100 * game.unusedClockFraction)}%` },
		]),
	};
}

/** The username a game was against. Their account may have since been deleted. */
function describeOpponent(evidence: AbuseEvidence, game_id: number): string {
	const opponent_id = evidence.opponentIdByGame[game_id]!;
	const opponent = evidence.opponents.find((member) => member.user_id === opponent_id);
	return opponent?.username ?? '(deleted)';
}

/** Everyone the player faced, most-played first. */
function buildOpponentsSection(evidence: AbuseEvidence): AlertSection {
	const frequency = evidence.opponentFrequency;
	const opponents = evidence.opponents.toSorted((a, b) => frequency[b.user_id]! - frequency[a.user_id]!); // prettier-ignore
	return {
		heading: 'OPPONENTS',
		kind: 'table',
		columns: ['Opponent', 'Games vs player', 'Joined', 'Total games', 'Shared IP'],
		rows: opponents.map((opponent) => [
			{ value: `${opponent.username} (${opponent.user_id})`, link: urlUtils.getAbsoluteMemberUrl(opponent.username) }, // prettier-ignore
			{ value: String(frequency[opponent.user_id]!) },
			{ value: emailTemplates.formatDayWithAge(timeutil.sqliteToTimestamp(opponent.joined)) },
			{ value: String(playerStatsManager.getUnabortedGameCount(opponent.user_id)!) },
			{ value: describeSharedIp(evidence.opponentSharesIp[opponent.user_id]) },
		]),
	};
}

/** Whether the player shares an IP address with an opponent, or `—` when either has none to compare. */
function describeSharedIp(sharesIp: boolean | undefined): string {
	if (sharesIp === undefined) return '—';
	return sharesIp ? 'Yes' : 'No';
}

// The Log Line ----------------------------------------------------------------

/** The report as one line: player, suspicion, rating change. The email carries the evidence. */
function buildLogLine(view: AbuseView): string {
	return `${view.player} | Suspicion ${view.suspicion} | ${view.ratingChange}`;
}

// Exports ---------------------------------------------------------------------

export default { reportFlagged };
