// src/shared/chess/load_variants/loadutil.ts

/**
 * Describes the shape of a dynamically imported load script module.
 * Load scripts are only present for variants with non-default movesets,
 * special moves, special vicinity, or preset annotations.
 */

import type { Movesets } from '../logic/movesets.js';
import type { RawType, RawTypeGroup } from '../util/typeutil.js';
import type { SpecialMoveFunction, SpecialVicinity } from '../logic/specialmove.js';

export interface LoadModule {
	/**
	 * Returns properties normally extracted from the position string ('+' notation)
	 * but unavailable for generator-based variants that have no position string.
	 * Used to generate specialRights for the starting position.
	 */
	getGeneratorRules?: () => { pawnDoublePush: boolean; castleWith?: RawType };
	/**
	 * Generates the full piece moveset modifications map for this variant.
	 * If absent, full default movesets are used.
	 */
	genMovesetModifications?: () => Movesets;
	/** Returns special move function overrides. */
	getSpecialMoves?: () => RawTypeGroup<SpecialMoveFunction>;
	/**
	 * Returns special vicinity overrides (squares a piece have a chance to capture on via special moves).
	 * Used for check calculation from specials.
	 */
	getSpecialVicinity?: () => SpecialVicinity;
	/**
	 * Returns permanent preset annotations (squares and/or rays) for this variant.
	 * Can't be erased. Helpful for emphasizing important lines/squares in showcasings.
	 */
	getAnnotePresets?: () => { squares?: string; rays?: string };
}
