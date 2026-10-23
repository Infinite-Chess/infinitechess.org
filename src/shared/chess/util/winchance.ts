// src/shared/chess/util/winchance.ts

/**
 * Converts engine scores into winning chances: the curve the eval gauge, Game Review
 * and engine-assistance detection all read evaluations through.
 */

import math from '../../util/math/math.js';

// Constants -------------------------------------------------------------------

/** Effective cp a forced mate maps to for win-probability purposes (mate-in-1 equivalent). */
const MATE_CP = 1800;

// Functions -------------------------------------------------------------------

/**
 * Maps a centipawn score to winning chances in [-1, 1], from that score's POV.
 * Clamps to ±`clampCp` first, so a caller's mate sentinel can sit at the extreme.
 */
function cpToWinningChances(cp: number, clampCp: number): number {
	const clamped = math.clamp(cp, -clampCp, clampCp);
	// Shallow curve (0.003) assumes players convert
	// advantages less efficiently than a perfect engine would.
	return 2 / (1 + Math.exp(-0.003 * clamped)) - 1;
}

/** Maps a cp score to a win probability [0, 1] from its POV, a forced mate counting as {@link MATE_CP}. */
function cpToWinProbability(cp: number): number {
	return 0.5 + 0.5 * cpToWinningChances(cp, MATE_CP);
}

// Exports ---------------------------------------------------------------------

export default {
	// Constants
	MATE_CP,
	// Functions
	cpToWinningChances,
	cpToWinProbability,
};
