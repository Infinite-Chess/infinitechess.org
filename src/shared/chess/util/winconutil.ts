// src/shared/chess/util/winconutil.ts

/**
 * This script contains lists of compatible win conditions in the game.
 * And contains a few utility methods for them.
 *
 */

import type { GameRules } from '../variants/gamerules.js';
import type { GameConclusion } from '../logic/gamefile.js';

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
 * List of all win conditions that happen after a move being made.
 * This excludes conclusions such as resignation, time, aborted, disconnect, and agreement.
 * which can happen at any point in time.
 */
const decisiveGameConclusions = [
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
 * Calculates if the provided game conclusion is a decisive conclusion.
 * This is any conclusion that can happen after a move is made.
 * Excludes conclusions like resignation, time, aborted, disconnect, and agreement.
 * which can happen at any point in time.
 * @param gameConclusion - The gameConclusion
 * @returns *true* if the gameConclusion is decisive.
 */
function isGameConclusionDecisive(gameConclusion: GameConclusion | undefined): boolean {
	if (gameConclusion === undefined) {
		throw new Error(
			'Should not be be testing if game conclusion is decisive when game is not over!',
		);
	}
	return isConclusionDecisive(gameConclusion.condition);
}

/**
 * A variant of {@link isGameConclusionDecisive} with the game conclusion PRE-SPLIT to remove the victor from the first half of it!
 *
 * Calculates if the provided conclusion is a decisive conclusion.
 * This is any conclusion that can happen after a move is made.
 * Excludes conclusions like resignation, time, aborted, disconnect, and agreement.
 * which can happen at any point in time.
 * @param condition - The gameConclusion
 * @returns *true* if the gameConclusion is decisive.
 */
function isConclusionDecisive(condition: string): boolean {
	return decisiveGameConclusions.includes(condition);
}

/**
 * Returns the termination of the game in english language.
 * @param gameRules
 * @param condition - The 2nd half of the gameConclusion: checkmate/stalemate/repetition/moverule/insuffmat/allpiecescaptured/royalcapture/allroyalscaptured/resignation/time/aborted/disconnect
 */
function getTerminationInEnglish(gameRules: GameRules, condition: string): string {
	if (condition === 'moverule') {
		// One exception
		const numbWholeMovesUntilAutoDraw = gameRules.moveRule! / 2;
		return `${translations['termination'].moverule[0]}${numbWholeMovesUntilAutoDraw}${translations['termination'].moverule[1]}`;
	}
	// @ts-ignore
	return translations['termination'][condition];
}

export default {
	ALL_CONDITIONS,

	isWinConditionValid,
	isGameConclusionDecisive,
	isConclusionDecisive,
	getTerminationInEnglish,
};
