// src/shared/chess/util/winconutil.ts

/**
 * This script contains lists of compatible win conditions in the game.
 * And contains a few utility methods for them.
 *
 */

import type { Player } from './typeutil.js';
import type { GameRules } from '../variants/gamerules.js';
import type { GameConclusion } from '../logic/gamefile.js';

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
	const { condition } = gameConclusion;
	return isConclusionDecisive(condition);
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
 * Calculates the victor and condition properties from the specified game conclusion.
 * For example, "1 checkmate" => `{ victor: 1, condition: 'checkmate' }`.
 * If the game was aborted, victor will be undefined.
 * If the game was a draw, victor will be Player 0 (neutral).
 * @param gameConclusion - The gameConclusion of the gamefile. Examples: '1 checkmate' / '0 stalemate'
 * @returns An object containing 2 properties: `victor` and `condition`
 */
function getVictorAndConditionFromGameConclusion(gameConclusion: string): {
	condition: string;
	victor?: Player;
} {
	const [victorStr, condition] = gameConclusion.split(' ');
	// If the conclusion is "aborted", then the victor isn't specified.
	if (victorStr === 'aborted') return { condition: victorStr };

	return {
		victor: Number(victorStr) as Player,
		condition: condition!,
	};
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
	isWinConditionValid,
	isGameConclusionDecisive,
	isConclusionDecisive,
	getTerminationInEnglish,
};
