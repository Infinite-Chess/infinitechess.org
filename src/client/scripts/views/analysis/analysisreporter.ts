// src/client/scripts/views/analysis/analysisreporter.ts

/**
 * Reports each position the analysis engine displays lines for, as its position key, for
 * engine-assistance detection to compare against live rated games. A position is reported per
 * display episode: the unbroken stretch its lines stay on screen. An episode is reported as it
 * starts, still open, and again once it ends, so a position on screen when the live game reaches
 * it is caught either way. Reports are batched, sent at most every {@link SCHEDULE} interval, and
 * kept until delivered: each episode says how long ago it ran, so a late one is still placed
 * correctly.
 */

import type { CevalStatus, CevalUpdate } from './ceval.js';

import timeutil from '../../../../shared/util/timeutil.js';
import gamerules from '../../../../shared/chess/util/gamerules.js';
import gamelimits from '../../../../shared/chess/util/gamelimits.js';
import positionkey from '../../../../shared/chess/logic/positionkey.js';

import ceval from './ceval.js';
import gameslot from '../../game/chess/gameslot.js';
import { serverfetch } from '../../util/serverfetch.js';

// Types -----------------------------------------------------------------------

/** One unbroken stretch of the engine's lines showing for a position, in `performance.now()` ms. */
interface Episode {
	key: string;
	startedAt: number;
	/** Undefined while it's still on screen. */
	endedAt?: number;
}

// Constants -------------------------------------------------------------------

/** How often reports may be sent. */
const SCHEDULE = {
	/** The shortest time between two reports. */
	intervalMs: timeutil.toMillis(2, 'seconds'),
	/** What the interval is multiplied by for each further consecutive failed report, as fetchretrier.ts backs off. */
	backoffFactor: 2,
	/** The longest the backed-off interval grows. */
	maxIntervalMs: timeutil.toMillis(1, 'minutes'),
};
/** The lowest HTTP status of a server error, which a report is retried on. */
const SERVER_ERROR_STATUS = 500;
/** The fewest characters a piece takes in a position string, e.g. `K5,1`. */
const MIN_PIECE_ENTRY_LENGTH = 4;
/**
 * Positions with more pieces than this can't be a rated game's, so aren't worth keying: a rated
 * game is server-validated, which holds its position string within this length.
 */
const MAX_REPORTED_PIECES = gamelimits.MAX_SERVER_VALIDATABLE_POSITION_LENGTH / MIN_PIECE_ENTRY_LENGTH; // prettier-ignore

// State -----------------------------------------------------------------------

/** The episode on screen now, if the engine is showing lines. */
let current: Episode | undefined;
/** The episodes awaiting a report: each one that started or ended since the last. */
const pending = new Set<Episode>();
/** Whether a report is in flight. */
let sending = false;
/** When the last report was sent, `performance.now()` ms. */
let lastSentAt = -Infinity;
/** How many reports in a row have failed to land. */
let failures = 0;
/** The next report's timer, and when it fires, while one is scheduled. */
let scheduled: { timer: ReturnType<typeof setTimeout>; at: number } | undefined;

// Events ----------------------------------------------------------------------

ceval.onUpdate((update) => onEngineUpdate(update));
ceval.onStatus((status) => onEngineStatus(status));
document.addEventListener('visibilitychange', onVisibilityChange);
window.addEventListener('pagehide', flushOnHide);
window.addEventListener('pageshow', (e) => {
	if (e.persisted) onShown(); // Back from the back/forward cache.
});
window.addEventListener('online', onOnline);

// Episodes --------------------------------------------------------------------

/** Starts an episode when the engine shows lines for a new position, ending the last. */
function onEngineUpdate(update: CevalUpdate | undefined): void {
	if (document.hidden) return; // Nothing is on screen: showing the page again starts the episode.
	if (!update || update.lines.length === 0) return endEpisode();
	const gamefile = gameslot.getGamefile()!; // The engine only ever analyses a loaded game.
	if (gamefile.pieces.coords.size > MAX_REPORTED_PIECES) return endEpisode();
	const sideToMove = gamerules.getWhosTurnAtMoveIndex(gamefile.gameRules, gamefile.state.local.moveIndex); // prettier-ignore
	const key = positionkey.of(gamefile.pieces, sideToMove);
	if (current?.key === key) return; // Still the same position: a deeper search isn't a new episode.
	endEpisode();
	current = { key, startedAt: performance.now() };
	queue(current, true);
}

/** The engine switching off, or failing to load, takes its lines off screen. */
function onEngineStatus(status: CevalStatus): void {
	if (status.kind === 'off' || status.kind === 'failed') endEpisode();
}

/** Hiding the page takes its lines off screen. */
function onVisibilityChange(): void {
	if (document.hidden) flushOnHide();
	else onShown();
}

/** The page is on screen again: what the engine shows starts a new episode. */
function onShown(): void {
	if (ceval.isEnabled()) onEngineUpdate(ceval.getLatestUpdate());
}

/** Ends the episode on screen, if any, queuing its end. */
function endEpisode(): void {
	if (!current) return;
	current.endedAt = performance.now();
	queue(current, false); // Already queued if its start is still unsent: one report then carries both.
	current = undefined;
}

/**
 * Queues an episode for the next report.
 * @param urgent - A start is: it's reported as soon as the interval allows. An end waits out a
 *   full interval, so the start that usually follows it at once rides the same report.
 */
function queue(episode: Episode, urgent: boolean): void {
	// A report holds a bounded number; past it, the oldest gives way.
	if (!pending.has(episode) && pending.size >= gamelimits.MAX_REPORTED_EPISODES) pending.delete(pending.values().next().value!); // prettier-ignore
	pending.add(episode);
	const now = performance.now();
	scheduleSend(urgent ? now : now + SCHEDULE.intervalMs);
}

// Sending ---------------------------------------------------------------------

/**
 * Schedules the next report for `soonest`, or the interval's end if that's later (longer after
 * failures), unless one is already in flight (its completion reschedules) or scheduled at least
 * as soon.
 */
function scheduleSend(soonest: number): void {
	if (sending) return;
	// The first retry waits the plain interval; each further failure multiplies it.
	const interval = Math.min(SCHEDULE.intervalMs * SCHEDULE.backoffFactor ** Math.max(0, failures - 1), SCHEDULE.maxIntervalMs); // prettier-ignore
	const at = Math.max(soonest, lastSentAt + interval);
	if (scheduled && scheduled.at <= at) return;
	if (scheduled) clearTimeout(scheduled.timer);
	scheduled = { timer: setTimeout(() => void send(), at - performance.now()), at };
}

/**
 * Reports every pending episode, putting them back to retry if the report doesn't land.
 * @param keepalive - Whether the request must outlive the page.
 */
async function send(keepalive = false): Promise<void> {
	if (scheduled) clearTimeout(scheduled.timer);
	scheduled = undefined;
	const batch = [...pending];
	pending.clear();
	sending = true;
	lastSentAt = performance.now();
	const done = await post(batch, keepalive);
	sending = false;
	failures = done ? 0 : failures + 1;
	if (!done) {
		// Back ahead of what queued in flight, oldest giving way past the bound. An episode that
		// ended in flight is in both: the set keeps it once.
		const retried = [...batch, ...pending].slice(-gamelimits.MAX_REPORTED_EPISODES);
		pending.clear();
		for (const episode of retried) pending.add(episode);
	}
	if (pending.size > 0) scheduleSend(performance.now());
}

/** The network is back: what failed to send goes now, not after the backed-off wait. */
function onOnline(): void {
	failures = 0;
	if (scheduled) clearTimeout(scheduled.timer);
	scheduled = undefined;
	if (pending.size > 0) scheduleSend(performance.now());
}

/**
 * Ends the episode on screen and reports what's pending at once, in a request that outlives the
 * page: a hidden page may be frozen or discarded before its timer fires.
 */
function flushOnHide(): void {
	endEpisode();
	if (pending.size > 0) void send(true);
}

/**
 * POSTs one report, each episode's ages computed now. Whether it's done with: delivered, or
 * refused (malformed, or over the rate limit), which retrying soon can't fix.
 */
async function post(batch: Episode[], keepalive: boolean): Promise<boolean> {
	const now = performance.now();
	const episodes = batch.map(({ key, startedAt, endedAt }) => ({ key, fromAgeMs: Math.round(now - startedAt), toAgeMs: endedAt === undefined ? 0 : Math.round(now - endedAt) })); // prettier-ignore
	try {
		const response = await serverfetch('/api/analysis-report', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ episodes }),
			keepalive,
		});
		return response.status < SERVER_ERROR_STATUS;
	} catch {
		return false; // Offline: retried once the network is back.
	}
}
