// src/server/game/featured/featuredSelection.ts

/**
 * The policy deciding which live games are featured beneath the lobby, modeled on Lichess TV:
 * how a game scores, when it has gone stale, how long a finished one stays up, and which
 * games hold the slots after any change. Pure — `featuredGames.ts` owns the state.
 */

import type { TimeControl } from '../../../shared/chess/util/clockutil.js';
import type { GameConclusion } from '../../../shared/chess/util/typeschemas.js';

import clockutil from '../../../shared/chess/util/clockutil.js';

import ratingCalculation from '../../utility/ratingCalculation.js';

// Types -----------------------------------------------------------------------

/** What the selection needs to know about one game, at the moment it runs. */
export interface Contender {
	id: number;
	/** See {@link score}. */
	score: number;
	moveCount: number;
	/** Whether it's live, and nobody has moved for its {@link staleLimitMs}. */
	stale: boolean;
	/** Whether it's concluded, and its {@link releaseTime} has passed. */
	released: boolean;
}

// Constants -------------------------------------------------------------------

/** How many games are featured at once. */
const MAX_SLOTS = 3;

/** How many times the lowest shown game's score a waiting game must beat to replace it. Lichess's. */
const WAY_BETTER = 1.17;

/**
 * How long a finished game stays up after it ends. Lichess's, but counted from the end rather than
 * the last move, so a conclusion long after it (a resignation, a timeout) still shows its badges.
 */
const HOLD_MS = 7000;

/** What a guest's seat scores, in place of a rating. */
const GUEST_RATING = ratingCalculation.DEFAULT_LEADERBOARD_ELO - 200;

/**
 * The stale limit's curve, `min(COEFFICIENT × E^EXPONENT, CAP_SECS)` seconds over a time control's
 * estimated length E: a fit to Lichess's per-channel limits (bullet 35 s … classical 480 s).
 */
const STALE_CURVE = { COEFFICIENT: 0.65, EXPONENT: 0.9, CAP_SECS: 480 };

// Scoring ---------------------------------------------------------------------

/**
 * A game's score: the average rating of its human seats. An engine's seat doesn't count.
 * @param seatRatings - Each human seat's rating, or undefined for a guest.
 */
function score(seatRatings: (number | undefined)[]): number {
	let total = 0;
	for (const rating of seatRatings) total += rating ?? GUEST_RATING;
	return total / seatRatings.length;
}

/** How long a live game may go without a move before it gives up its slot. Untimed games use the default time control's. */
function staleLimitMs(clock: TimeControl): number {
	const timed = clockutil.isClockValueInfinite(clock) ? clockutil.DEFAULT_TIME_CONTROL : clock;
	const curve = STALE_CURVE.COEFFICIENT * clockutil.estimateGameSeconds(timed) ** STALE_CURVE.EXPONENT; // prettier-ignore
	return 1000 * Math.min(curve, STALE_CURVE.CAP_SECS);
}

/** When a concluded game gives up its slot. An aborted one has no result to show, so at once. */
function releaseTime(conclusion: GameConclusion, timeEnded: number): number {
	return conclusion.condition === 'aborted' ? timeEnded : timeEnded + HOLD_MS;
}

// Selection -------------------------------------------------------------------

/**
 * Decides which games hold the slots, left to right. Boards never re-sort: newcomers take the exact
 * places of the boards they replace, the best leftmost, and only an unfilled vacancy makes the
 * boards right of it slide left. A stale game is never a candidate, or it would win back the slot
 * it just gave up.
 * @param shown - The games currently in the slots, left to right.
 * @param waiting - Every other live game.
 * @returns The ids of the games that should now hold the slots, left to right.
 */
function select(shown: Contender[], waiting: Contender[]): number[] {
	const candidates = waiting.filter((c) => !c.stale).sort((a, b) => compare(a, b));
	const places: (Contender | undefined)[] = shown.map((c) => (c.released ? undefined : c));

	// A released board's place is refilled, leftmost first. Unfilled ones close up.
	for (let i = 0; i < places.length; i++) places[i] ??= candidates.shift();
	const slots = places.filter((c) => c !== undefined);

	while (slots.length < MAX_SLOTS && candidates.length > 0) slots.push(candidates.shift()!);
	// A stale board gives up its place only to a candidate there was no room for.
	for (let i = 0; i < slots.length && candidates.length > 0; i++) {
		if (slots[i]!.stale) slots[i] = candidates.shift()!;
	}
	displaceWithWayBetter(slots, candidates);
	arrangeNewcomers(slots, shown);

	return slots.map((c) => c.id);
}

/** Orders games best first: highest score, then fewest moves. */
function compare(a: Contender, b: Contender): number {
	return b.score - a.score || a.moveCount - b.moveCount;
}

/** Replaces the lowest-scoring board, in place, while the best candidate scores {@link WAY_BETTER} than it. */
function displaceWithWayBetter(slots: Contender[], candidates: Contender[]): void {
	while (candidates.length > 0) {
		let lowest = 0;
		for (let i = 1; i < slots.length; i++)
			if (slots[i]!.score < slots[lowest]!.score) lowest = i;
		if (candidates[0]!.score <= WAY_BETTER * slots[lowest]!.score) return;
		slots[lowest] = candidates.shift()!;
	}
}

/** Reorders the games new to the slots among the places they took, best first, left to right. */
function arrangeNewcomers(slots: Contender[], shown: Contender[]): void {
	const isNew = (c: Contender): boolean => !shown.includes(c);
	const newcomers = slots.filter((c) => isNew(c)).sort((a, b) => compare(a, b));
	for (let i = 0; i < slots.length; i++) if (isNew(slots[i]!)) slots[i] = newcomers.shift()!;
}

// Exports ---------------------------------------------------------------------

export default {
	// Scoring
	score,
	staleLimitMs,
	releaseTime,
	// Selection
	select,
};
