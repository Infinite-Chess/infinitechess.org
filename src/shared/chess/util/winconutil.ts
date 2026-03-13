// src/shared/chess/util/winconutil.ts

/**
 * This script contains lists of compatible win conditions in the game.
 * And contains a few utility methods for them.
 *
 */

import type { GameRules } from '../variants/gamerules.js';

/** All possible game conclusion terminations. */
const ALL_CONDITIONS = [
	// Win/loss conditions (determined during gameplay)
	'checkmate',
	'royalcapture',
	'allroyalscaptured',
	'allpiecescaptured',
	'koth', // King of the Hill
	'time',
	// Draw conditions
	'stalemate',
	'moverule',
	'repetition',
	'insuffmat', // insufficient material
	'agreement',
	// Game termination without completion
	'resignation',
	'disconnect',
	'aborted',
] as const;

/**
 * Union type of all possible game conclusion conditions.
 * Represents how a game can be terminated.
 */
export type Condition = (typeof ALL_CONDITIONS)[number];

/** Valid win conditions that either color can have. */
const validWinConditions = [
	'checkmate',
	'royalcapture',
	'allroyalscaptured',
	'allpiecescaptured',
	'koth',
];

/**
 * List of all conclusions that are triggered by a move being made.
 * This excludes conclusions such as resignation, time, aborted, disconnect, and agreement,
 * which can happen at any point in time.
 */
const moveTriggeredConclusions = [
	...validWinConditions,
	'stalemate',
	'repetition',
	'moverule',
	'insuffmat',
];

/**
 * true if the provided win condition is valid for any color to have in the gamerules.
 * This excludes draw conditions, and stuff like time forfeit or resignation.
 * @param winCondition - The win condition
 * @returns
 */
function isWinConditionValid(winCondition: string): boolean {
	return validWinConditions.includes(winCondition);
}

/**
 * Calculates if the provided condition is move-triggered.
 * This is any conclusion that can happen after a move is made.
 * Excludes conclusions like resignation, time, aborted, disconnect,
 * and agreement, which can happen at any point in time.
 * @param condition - The `condition` property of a `GameConclusion` object.
 * @returns *true* if the condition is move-triggered.
 */
function isConclusionMoveTriggered(condition: string): boolean {
	return moveTriggeredConclusions.includes(condition);
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
	ALL_CONDITIONS,

	isWinConditionValid,
	isConclusionMoveTriggered,
	getTerminationInEnglish,
};
