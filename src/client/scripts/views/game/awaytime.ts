// src/client/scripts/views/game/awaytime.ts

/**
 * Measures, for each of our moves in an online game, how the page lost us since our previous
 * move: how long it was unfocused or hidden during the opponent's turn and during ours, and how
 * long before the move we last came back. Sent with the move for engine-assistance detection:
 * consulting an engine in another tab or app leaves the page.
 */

import type { SubmitMoveMessage } from '../../../../shared/transport/serverbound.js';

import { GameBus } from '../../board/GameBus.js';
import gamesession from '../../game/chess/gamesession.js';

// Types -----------------------------------------------------------------------

/** Whose turn time away counts toward. */
type Turn = 'opponent' | 'own';

/** The time away measured since our previous move. */
interface Measurement {
	/** Whose turn it counts toward now. */
	turn: Turn;
	/** How long the page was away, per turn, before {@link awaySince}. */
	awayMs: Record<Turn, number>;
	/** When the page lost us, while it still has. */
	awaySince: number | undefined;
	/** When the page last got us back. */
	returnedAt: number | undefined;
}

// State -----------------------------------------------------------------------

/** What's being measured, while we're playing. */
let measuring: Measurement | undefined;
/** Each of our moves' away time, by move index, so a resubmitted move carries the same. */
const byMove = new Map<number, NonNullable<SubmitMoveMessage['away']>>();

// Events ----------------------------------------------------------------------

GameBus.addEventListener('game-loaded', () => {
	if (gamesession.getRole() === undefined) return; // Spectating.
	startMeasuring(gamesession.isItOurTurn() ? 'own' : 'opponent');
});
GameBus.addEventListener('opponent-move-played', () => onOurTurn());
window.addEventListener('blur', onPresenceChange);
window.addEventListener('focus', onPresenceChange);
document.addEventListener('visibilitychange', onPresenceChange);

// Measuring -------------------------------------------------------------------

/** Starts measuring afresh, now, toward `turn`'s time away. */
function startMeasuring(turn: Turn): void {
	const awaySince = isAway() ? performance.now() : undefined;
	measuring = { turn, awayMs: { opponent: 0, own: 0 }, awaySince, returnedAt: undefined };
}

/** Our turn began: time away from here on is ours, including any that's ongoing. */
function onOurTurn(): void {
	if (measuring?.turn !== 'opponent') return; // Not playing.
	bankAway(measuring, performance.now());
	measuring.turn = 'own';
}

/** Whether the page has lost us: it's hidden, or another window or app has focus. */
function isAway(): boolean {
	return document.hidden || !document.hasFocus();
}

/** The page lost or regained us. */
function onPresenceChange(): void {
	if (!measuring) return;
	const now = performance.now();
	if (isAway()) measuring.awaySince ??= now;
	else if (measuring.awaySince !== undefined) {
		bankAway(measuring, now);
		measuring.awaySince = undefined;
		measuring.returnedAt = now;
	}
}

/** Adds the ongoing time away, up to `now`, to the current turn's, continuing from `now`. */
function bankAway(measurement: Measurement, now: number): void {
	if (measurement.awaySince === undefined) return;
	measurement.awayMs[measurement.turn] += now - measurement.awaySince;
	measurement.awaySince = now;
}

/** Records the away time of our move at `moveIndex`, then measures toward the opponent's turn. */
function recordMove(moveIndex: number): void {
	// In an engine game our turn starts on the engine's move, which isn't an opponent's.
	if (measuring?.turn !== 'own') return;
	const now = performance.now();
	bankAway(measuring, now);
	const { awayMs, awaySince, returnedAt } = measuring;
	if (awayMs.opponent + awayMs.own > 0) {
		const returnedMsBefore = awaySince !== undefined || returnedAt === undefined ? null : Math.round(now - returnedAt); // prettier-ignore
		byMove.set(moveIndex, [Math.round(awayMs.opponent), Math.round(awayMs.own), returnedMsBefore]); // prettier-ignore
	}
	startMeasuring('opponent');
}

/** The away time of our move at `moveIndex`, or null if the page never lost us, or it isn't ours. */
function getMove(moveIndex: number): SubmitMoveMessage['away'] {
	return byMove.get(moveIndex) ?? null;
}

// Exports ---------------------------------------------------------------------

export default {
	recordMove,
	getMove,
};
