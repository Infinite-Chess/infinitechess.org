// src/client/scripts/esm/views/analysis/compression/enginehorizons.ts

/**
 * How far Apeiron's perception reaches, in squares. Compression keeps every relation within
 * these horizons exact, and only the order of everything beyond them.
 */

// Constants -------------------------------------------------------------------

/**
 * The furthest the engine reads a distance between two squares: its king rays drop any piece at
 * i32::MAX or further. Every eval threshold (Amazon tropism, at 1788, is the widest) sits far inside.
 */
const EXACT_SPAN = 2n ** 31n;

/**
 * How near a third piece's line a far crossing must pass for the engine to notice: no line offset
 * it reads exceeds 216, and slider wiggles 2, leaving room for pieces to drift during a search.
 */
const NEAR_LINE_SPAN = 4096n;

// Exports ---------------------------------------------------------------------

export default {
	EXACT_SPAN,
	NEAR_LINE_SPAN,
};
