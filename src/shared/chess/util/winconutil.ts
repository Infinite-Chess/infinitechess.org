// src/shared/chess/util/winconutil.ts

/**
 * The vocabulary of how a game can end: every win, draw and abort condition, and the
 * English wording each one is written with.
 *
 * Deliberately zod-free. The GameConclusion SCHEMA built from these lists lives in
 * typeschemas.ts, so that icnconverter.ts — and through it both engine workers — can read
 * the condition names without bundling zod.
 */

// Types -----------------------------------------------------------------------

/** Condition where one player wins. victor will be a Player. */
type WinCondition = (typeof WIN_CONDITIONS)[number];
/** Win condition that is a valid gamerule option for either color. */
export type GameruleWinCondition = (typeof GAMERULE_WIN_CONDITIONS)[number];
/** Condition that results in a draw. victor will be null. */
type DrawCondition = (typeof DRAW_CONDITIONS)[number];
/** Condition that aborts the game. victor will be undefined. */
type AbortCondition = 'aborted';
type MoveTriggeredCondition = (typeof MOVE_TRIGGERED_CONCLUSIONS)[number];

/**
 * Union type of all possible game conclusion conditions.
 * Represents how a game can be terminated.
 */
export type Condition = WinCondition | DrawCondition | AbortCondition;

// Constants -------------------------------------------------------------------

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
 * `disconnect` = a player abandoned the game (disconnected) and their opponent claimed victory.
 */
const WIN_CONDITIONS = [...GAMERULE_WIN_CONDITIONS, 'time', 'resignation', 'disconnect'] as const;

/** Draw conditions that are triggered by a move being made. */
const MOVE_TRIGGERED_DRAW_CONDITIONS = [
	'stalemate',
	'moverule',
	'repetition',
	'insuffmat', // Insufficient material
] as const;

/**
 * Conditions that result in a draw (victor is null).
 * `agreement` = both players agreed.
 * `abandonment` = a player abandoned the game (disconnected) and their opponent
 *     took a draw instead of claiming the win, or both players abandoned it.
 */
const DRAW_CONDITIONS = [...MOVE_TRIGGERED_DRAW_CONDITIONS, 'agreement', 'abandonment'] as const;

/**
 * List of all conclusions that are triggered by a move being made.
 * This excludes conclusions such as resignation, time, aborted, disconnect, and agreement,
 * which can happen at any point in time.
 */
const MOVE_TRIGGERED_CONCLUSIONS = [
	...GAMERULE_WIN_CONDITIONS,
	...MOVE_TRIGGERED_DRAW_CONDITIONS,
] as const;

/**
 * Maps each game conclusion condition to its English termination string.
 * Always English by convention, since ICN metadata should only ever be in English.
 */
const TERMINATION_IN_ENGLISH = {
	checkmate: 'Checkmate',
	stalemate: 'Stalemate',
	repetition: 'Threefold repetition',
	/** The move count is inserted before this string. e.g. "50-move rule" */
	moverule: '-move rule',
	insuffmat: 'Insufficient material',
	royalcapture: 'Royal capture',
	allroyalscaptured: 'All royals captured',
	allpiecescaptured: 'All pieces captured',
	koth: 'King of the hill',
	resignation: 'Resignation',
	agreement: 'Agreement',
	time: 'Time forfeit',
	aborted: 'Aborted',
	disconnect: 'Abandoned',
	abandonment: 'Abandoned',
} as const;

// Functions -------------------------------------------------------------------

/**
 * Whether the provided condition is one a move can trigger.
 * Excludes conclusions like resignation, time, aborted, disconnect,
 * and agreement, which can happen at any point in time.
 */
function isConclusionMoveTriggered(condition: Condition): boolean {
	return MOVE_TRIGGERED_CONCLUSIONS.includes(condition as MoveTriggeredCondition);
}

/**
 * Returns the termination of the game in english language.
 * @param moveRule - The game's `moveRule` gamerule, read only by the
 *   'moverule' condition, whose termination names it. Always present then.
 */
function getTerminationInEnglish(moveRule: number | undefined, condition: Condition): string {
	if (condition === 'moverule') {
		// One exception - the move rule termination includes the number of moves until the auto-draw is triggered. For example, "50-move rule".
		const numbWholeMovesUntilAutoDraw = moveRule! / 2;
		return `${numbWholeMovesUntilAutoDraw}${TERMINATION_IN_ENGLISH.moverule}`;
	}
	return TERMINATION_IN_ENGLISH[condition];
}

// Exports ---------------------------------------------------------------------

export default {
	// Constants
	GAMERULE_WIN_CONDITIONS,
	WIN_CONDITIONS,
	DRAW_CONDITIONS,
	// Functions
	isConclusionMoveTriggered,
	getTerminationInEnglish,
};
