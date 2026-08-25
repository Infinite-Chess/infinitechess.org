// src/shared/chess/util/gameresultutil.ts

/**
 * Shared helper for a concluded game's display result — the score (e.g. "1-0") and
 * a one-line sentence (e.g. "White wins by checkmate"). Used by the game page's SSR
 * result banner and reusable by the client for live conclusions.
 */

import type { GameConclusion } from './winconutil.js';
import type { ScriptTranslations } from '../../types/script-translations.js';

import { players } from '../../util/typeutil.js';
import { interpolate } from '../../util/interpolate.js';

// Types -----------------------------------------------------------------------

/** A concluded game's display result: the score and a one-line sentence. */
interface GameResultDisplay {
	/** PGN-style score: `"1-0"`, `"0-1"`, `"½-½"`, or `""` for an aborted game. */
	score: string;
	/** Sentence describing the outcome, e.g. `"White wins by checkmate"`. */
	text: string;
}

// Functions -------------------------------------------------------------------

/** Derives the display score + sentence for a concluded game. */
function getResultDisplay(
	conclusion: GameConclusion,
	sharedT: ScriptTranslations['shared'],
): GameResultDisplay {
	if (conclusion.condition === 'aborted') return { score: '', text: sharedT.game_result.aborted };
	const label = sharedT.conditions[conclusion.condition];
	if (conclusion.victor === null) {
		return { score: '½-½', text: interpolate(sharedT.game_result.draw_by, { label }) };
	}
	const isWhite = conclusion.victor === players.WHITE;
	const color = isWhite ? sharedT.sides.white : sharedT.sides.black;
	return {
		score: isWhite ? '1-0' : '0-1',
		text: interpolate(sharedT.game_result.color_wins_by, { color, label }),
	};
}

// Exports ---------------------------------------------------------------------

export default { getResultDisplay };
