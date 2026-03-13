// src/shared/chess/util/winconutil.ts

/**
 * This script contains lists of compatible win conditions in the game.
 * And contains a few utility methods for them.
 *
 */

import type { Player } from './typeutil.js';
import type { GameRules } from '../variants/gamerules.js';

import * as z from 'zod';

// Constants -----------------------------------------------------------------

/**
 * Win conditions that are valid gamerule options for either color.
 * These are triggered by a move being made.
 * This excludes action-based wins like time forfeit, resignation, and disconnect.
 */
const GAMERULE_WIN_CONDITIONS = [
	'checkmate',
	'royalcapture',
	'allroyalscaptured',
	'allpiecescaptured',
	'koth', // King of the Hill
] as const;

/**
 * Conditions where one player wins (victor is a Player).
 * Covers both move-triggered wins and action-based wins.
 */
const WIN_CONDITIONS = [...GAMERULE_WIN_CONDITIONS, 'time', 'resignation', 'disconnect'] as const;

/** Draw conditions that are triggered by a move being made. */
const MOVE_TRIGGERED_DRAW_CONDITIONS = [
	'stalemate',
	'moverule',
	'repetition',
	'insuffmat', // Insufficient material
] as const;

/** Conditions that result in a draw (victor is null). */
const DRAW_CONDITIONS = [...MOVE_TRIGGERED_DRAW_CONDITIONS, 'agreement'] as const;

/**
 * List of all conclusions that are triggered by a move being made.
 * This excludes conclusions such as resignation, time, aborted, disconnect, and agreement,
 * which can happen at any point in time.
 */
const MOVE_TRIGGERED_CONCLUSIONS = [
	...GAMERULE_WIN_CONDITIONS,
	...MOVE_TRIGGERED_DRAW_CONDITIONS,
] as const;

// Types --------------------------------------------------------------------------

/** Condition where one player wins. victor will be a Player. */
type WinCondition = (typeof WIN_CONDITIONS)[number];
/** Win condition that is a valid gamerule option for either color. */
export type GameruleWinCondition = (typeof GAMERULE_WIN_CONDITIONS)[number];
/** Condition that results in a draw. victor will be null. */
type DrawCondition = (typeof DRAW_CONDITIONS)[number];
/** Condition that aborts the game. victor will be undefined. */
type AbortCondition = 'aborted';
type MoveTriggeredCondition = (typeof MOVE_TRIGGERED_CONCLUSIONS)[number];

/** Game ended with a decisive result — one player won. */
type WinConclusion = {
	condition: WinCondition;
	/** The player who won. */
	victor: Player;
};

/** Game ended in a draw. */
type DrawConclusion = {
	condition: DrawCondition;
	/** null indicates a draw. */
	victor: null;
};

/** Game was aborted before completion — no result. */
type AbortConclusion = {
	condition: AbortCondition;
	/** undefined indicates no result. */
	victor?: undefined;
};

/** Stores the results of a game, including how it was terminated, and who won. */
export type GameConclusion = WinConclusion | DrawConclusion | AbortConclusion;

/**
 * Union type of all possible game conclusion conditions.
 * Represents how a game can be terminated.
 */
export type Condition = WinCondition | DrawCondition | AbortCondition;

// Schemas --------------------------------------------------------------------------

/** The zod schema for validating a GameConclusion object. */
const gameConclusionSchema = z.discriminatedUnion('condition', [
	z.strictObject({
		condition: z.enum(WIN_CONDITIONS),
		victor: z.number().int().nonnegative() as z.ZodType<Player>,
	}),
	z.strictObject({
		condition: z.enum(DRAW_CONDITIONS),
		victor: z.literal(null),
	}),
	z.strictObject({
		condition: z.literal('aborted'),
	}),
]);

// Functions --------------------------------------------------------------------------

/**
 * Calculates if the provided condition is move-triggered.
 * This is any conclusion that can happen after a move is made.
 * Excludes conclusions like resignation, time, aborted, disconnect,
 * and agreement, which can happen at any point in time.
 * @param condition - The `condition` property of a `GameConclusion` object.
 * @returns *true* if the condition is move-triggered.
 */
function isConclusionMoveTriggered(condition: string): boolean {
	return MOVE_TRIGGERED_CONCLUSIONS.includes(condition as MoveTriggeredCondition);
}

/**
 * Returns the termination of the game in english language.
 * @param gameRules
 * @param condition - The 2nd half of the gameConclusion: checkmate/stalemate/repetition/moverule/insuffmat/allpiecescaptured/royalcapture/allroyalscaptured/resignation/time/aborted/disconnect
 */
function getTerminationInEnglish(gameRules: GameRules, condition: Condition): string {
	if (condition === 'moverule') {
		// One exception
		const numbWholeMovesUntilAutoDraw = gameRules.moveRule! / 2;
		return `${translations['termination'].moverule[0]}${numbWholeMovesUntilAutoDraw}${translations['termination'].moverule[1]}`;
	}
	return translations['termination'][condition];
}

export default {
	gameConclusionSchema,

	GAMERULE_WIN_CONDITIONS,

	isConclusionMoveTriggered,
	getTerminationInEnglish,
};
