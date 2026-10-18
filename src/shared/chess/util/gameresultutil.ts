// src/shared/chess/util/gameresultutil.ts

/**
 * A concluded game's display result: each player's points, the game's score built from them
 * (e.g. "1-0"), and a one-line sentence (e.g. "White wins by checkmate").
 */

import type { GameConclusion } from './typeschemas.js';
import type { ScriptTranslations } from '../../types/script-translations.js';

import interpolate from '../../util/interpolate.js';
import { players, Player } from './typeutil.js';

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
function getDisplay(
	conclusion: GameConclusion,
	sharedT: ScriptTranslations['shared'],
): GameResultDisplay {
	if (conclusion.condition === 'aborted') return { score: '', text: sharedT.game_result.aborted };
	const score = `${getScore(conclusion, players.WHITE)}-${getScore(conclusion, players.BLACK)}`;
	const label = sharedT.conditions[conclusion.condition];
	if (conclusion.victor === null) {
		return { score, text: interpolate.interpolate(sharedT.game_result.draw_by, { label }) };
	}
	const color = conclusion.victor === players.WHITE ? sharedT.sides.white : sharedT.sides.black;
	return {
		score,
		text: interpolate.interpolate(sharedT.game_result.color_wins_by, { color, label }),
	};
}

/** A player's points from a concluded game: "1", "0", or "½" each for a draw. None if aborted. */
function getScore(conclusion: GameConclusion, player: Player): string | undefined {
	if (conclusion.condition === 'aborted') return undefined;
	if (conclusion.victor === null) return '½';
	return conclusion.victor === player ? '1' : '0';
}

// Exports ---------------------------------------------------------------------

export default { getDisplay, getScore };
