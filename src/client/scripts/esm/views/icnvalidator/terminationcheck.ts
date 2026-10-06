// src/client/scripts/esm/views/icnvalidator/terminationcheck.ts

/**
 * Checks a game's recorded Termination and Result metadata against
 * how the site's own game-end detection says the game ended.
 */

import type { GameConclusion } from '../../../../../shared/chess/util/typeschemas.js';

import metadatautil from '../../../../../shared/chess/util/metadatautil.js';

// Constants -------------------------------------------------------------------

/** Each Termination tag that ends a game, mapped to the site's conclusion condition. */
const CONDITION_MAPPINGS: Record<string, GameConclusion['condition']> = {
	Checkmate: 'checkmate',
	'All pieces captured': 'allpiecescaptured',
	'Royal capture': 'royalcapture',
	'All royals captured': 'allroyalscaptured',
	Stalemate: 'stalemate',
	'Threefold repetition': 'repetition',
	'50-move rule': 'moverule',
	'Insufficient material': 'insuffmat',
};

// Termination Metadata --------------------------------------------------------

/** Throws if the game's Termination/Result metadata disagrees with how the game actually ended. */
function validate(
	termination: string | undefined,
	result: string | undefined,
	gameConclusion: GameConclusion | undefined,
): void {
	if (termination === 'Maximum moves reached') {
		if (gameConclusion !== undefined)
			throw new Error(`Termination is "Maximum moves reached" but game is over: ${JSON.stringify(gameConclusion)}`); // prettier-ignore
		return;
	}
	// Adjudication terminations are suffixed with their eval threshold, e.g. "Max-ply adjudication (|eval| >= 1000 cp)"
	if (
		termination &&
		(termination.startsWith('Material adjudication') ||
			termination.startsWith('Max-ply adjudication'))
	) {
		if (gameConclusion !== undefined)
			throw new Error(`Termination is "${termination}", but game is over: ${JSON.stringify(gameConclusion)}`); // prettier-ignore
		return;
	}
	if (gameConclusion === undefined) {
		// Including "Loss on time": a time loss is deliberately a failure, not an accepted ending.
		if (termination)
			throw new Error(`Game isn't over, but Termination is specified: "${termination}"`);
		return;
	}

	const { victor, condition } = gameConclusion;

	if (termination && termination in CONDITION_MAPPINGS) {
		if (condition !== CONDITION_MAPPINGS[termination])
			throw new Error(`Game is over by ${condition}, but Termination is "${termination}"`);
	} else if (termination) {
		throw new Error(`Disallowed Termination metadata: "${termination}"`);
	}

	if (victor !== undefined && result && victor !== metadatautil.getVictorFromResult(result)) {
		throw new Error(`Result "${result}" does not match victor ${victor}`);
	}
}

// Exports ---------------------------------------------------------------------

export default {
	// Termination Metadata
	validate,
};
