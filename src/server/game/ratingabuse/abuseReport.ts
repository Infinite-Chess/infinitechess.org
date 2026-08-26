// src/server/game/ratingabuse/abuseReport.ts

/**
 * Renders the outcome of a rating-abuse measurement: writes it to `ratingAbuseLog`,
 * and emails Naviary when a flagged player clears the notification buffer.
 *
 * The only place a measurement becomes words — edit the wording here.
 * Every report shares one body, so the log and the email can never disagree.
 */

import type { AbuseReportContext, SuspicionVerdict } from './ratingAbuseTypes.js';

import timeutil from '../../../shared/util/timeutil.js';

import logEvents from '../../utility/logEvents.js';
import emailService from '../../utility/emailService.js';
import ratingAbuseManager from '../../database/ratingAbuseManager.js';

// Constants -------------------------------------------------------------------

/** Buffer time for sending the next email. If a user is found suspicious several times in that interval, no email is sent. */
const SUSPICIOUS_USER_NOTIFICATION_BUFFER_MS = 1000 * 60 * 60 * 24; // 24 hours

// Reports ---------------------------------------------------------------------

/**
 * Reports a completed measurement: logs it either way, and — when the player
 * was flagged — emails Naviary, unless one was already sent within the buffer.
 * @param lastAlertedAt - When this player was last emailed about, from the rating_abuse table.
 */
function reportMeasurement(
	ctx: AbuseReportContext,
	verdict: SuspicionVerdict,
	lastAlertedAt: string | null,
): void {
	if (!verdict.suspicious) {
		void logEvents.add(
			`Innocent? Suspicion total weight: ${verdict.totalWeight}. ` +
				`${describeMeasurement(ctx)}, and user seems innocent. ` +
				buildBody(ctx, verdict, false),
			'ratingAbuseLog',
		);
		return;
	}

	const messageText = `
>>>>>> GUILTY??? Suspicion total weight: ${verdict.totalWeight}.
${describeMeasurement(ctx)}, and user might be cheating!
${buildBody(ctx, verdict, true)}
	`;
	console.log(`User ${ctx.username} is under suspicion of rating abuse (weight: ${verdict.totalWeight})! - Check ratingAbuseLog.txt for more details.`); // prettier-ignore
	void logEvents.add('\n' + messageText, 'ratingAbuseLog');

	// If enough time has passed from the last alarm for that user, send an email about his rating abuse
	if (
		lastAlertedAt === null ||
		Date.now() - timeutil.sqliteToTimestamp(lastAlertedAt) >=
			SUSPICIOUS_USER_NOTIFICATION_BUFFER_MS
	) {
		const messageSubject = `Rating Abuse Warning: user ${ctx.username}, user_id ${ctx.user_id}`;
		void emailService.sendRatingAbuseEmail(messageSubject, messageText);
		// Update RatingAbuse table with last_alerted_at value
		const last_alerted_at = timeutil.timestampToSqlite(Date.now());
		ratingAbuseManager.updateColumns(ctx.user_id, ctx.leaderboard_id, { last_alerted_at });
	}
}

/**
 * Reports a measurement abandoned before any check ran, because the player LOST
 * elo over the interval. Logged only — a player shedding rating is never flagged.
 */
function reportNoRatingGain(
	user_id: number,
	username: string,
	leaderboard_id: number,
	netRatingChange: number,
	gameIds: number[],
	gameInterval: number,
): void {
	void logEvents.add(
		`Innocent: Ran suspicion check for user ${username} with user_id ${user_id} on leaderboard ${leaderboard_id}, but user net rating change ${netRatingChange} is not positive in the last ${gameInterval} games. Game IDs: ${JSON.stringify(gameIds)}.`,
		'ratingAbuseLog',
	);
}

// Composition -----------------------------------------------------------------

/** The one-line preamble naming who was measured, on what, and to what effect. */
function describeMeasurement(ctx: AbuseReportContext): string {
	return `Ran suspicion check for user ${ctx.username} with user_id ${ctx.user_id} on leaderboard ${ctx.leaderboard_id} with net rating change ${ctx.netRatingChange} in the last ${ctx.gameIds.length} games`;
}

/**
 * The evidence dump shared by every report, so the log and the email never diverge.
 * @param pretty - Whether to indent the JSON. Set for the emailed (flagged) report, which is read by a human.
 */
function buildBody(ctx: AbuseReportContext, verdict: SuspicionVerdict, pretty: boolean): string {
	const indent = pretty ? 2 : undefined;
	const sep = pretty ? '\n' : ' ';
	return [
		`Suspicion level record: ${JSON.stringify(verdict.records, undefined, indent)}.`,
		`Opponent user_id_list: ${JSON.stringify(ctx.evidence.opponentIds)}.`,
		`OpponentInfoList: ${JSON.stringify(ctx.evidence.opponents, undefined, indent)}.`,
		`Game_id_list: ${JSON.stringify(ctx.gameIds)}.`,
		`GameInfo list: ${JSON.stringify(ctx.evidence.games, undefined, indent)}.`,
	].join(sep);
}

// Exports ---------------------------------------------------------------------

export default {
	reportMeasurement,
	reportNoRatingGain,
};
