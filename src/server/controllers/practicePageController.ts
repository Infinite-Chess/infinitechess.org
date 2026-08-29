// src/server/controllers/practicePageController.ts

/**
 * Builds the SSR render state for the `/checkmatepractice` page: every practice checkmate,
 * grouped by difficulty, with each one's pieces resolved to inline SVG markup — so the
 * selection list paints fully on first request with no client round-trip.
 */

import icnposition from '../../shared/chess/logic/icn/icnposition.js';
import validcheckmates from '../../shared/chess/util/validcheckmates.js';
import { ENGINE_DICTIONARY } from '../../shared/chess/util/engine.js';
import typeutil, { players as p } from '../../shared/util/typeutil.js';

import pieceSvgCache from '../config/pieceSvgCache.js';

// Types -----------------------------------------------------------------------

/** The full render context for `checkmatepractice.njk`. */
interface PracticePageState {
	/** The checkmate list, grouped by difficulty, in display order. */
	groups: DifficultyGroupViewModel[];
	/** The practice bot's display name, for the top player bar. */
	botName: string;
}

/** One difficulty section of the checkmate list. */
interface DifficultyGroupViewModel {
	/** Difficulty key into the practice component's `difficulty` translations. */
	difficulty: string;
	checkmates: CheckmateViewModel[];
}

/** One checkmate banner: its id and the piece icons showing its pattern. */
interface CheckmateViewModel {
	id: string;
	white: PieceIconViewModel[];
	black: PieceIconViewModel[];
}

/** One piece icon. `collated` overlaps it onto the previous icon of its batch. */
interface PieceIconViewModel {
	/** The piece's own `<svg>` markup, in its player's colors — never recolored. */
	svg: string;
	collated: boolean;
}

// State -----------------------------------------------------------------------

/** The checkmate list is static, so the whole view model is built once. */
const state: PracticePageState = {
	groups: Object.entries(validcheckmates.VALID_CHECKMATES).map(([difficulty, checkmates]) => ({
		difficulty,
		checkmates: checkmates.map((id) => buildCheckmateViewModel(id)),
	})),
	botName: ENGINE_DICTIONARY.engineCheckmatePractice.displayName,
};

// Functions -------------------------------------------------------------------

/** Resolves a checkmate id like `"1K2N1B-1k"` into its per-color piece icon lists. */
function buildCheckmateViewModel(id: string): CheckmateViewModel {
	const white: PieceIconViewModel[] = [];
	const black: PieceIconViewModel[] = [];

	// Each batch is a count followed by a piece abbreviation, e.g. "2N".
	for (const batch of id.match(/[0-9]+[a-zA-Z]+/g)!) {
		const amount = parseInt(batch.match(/[0-9]+/)![0]);
		const type = icnposition.getTypeFromAbbr(batch.match(/[a-zA-Z]+/)![0]);
		const [rawType, player] = typeutil.splitType(type);
		const svg = pieceSvgCache.get(rawType, player);
		const list = player === p.WHITE ? white : black;
		for (let j = 0; j < amount; j++) list.push({ svg, collated: j > 0 });
	}

	return { id, white, black };
}

/** Returns the render state for `/checkmatepractice`. */
function getPageState(): PracticePageState {
	return state;
}

// Exports ---------------------------------------------------------------------

export default { getPageState };
