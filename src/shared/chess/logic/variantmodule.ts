// src/shared/chess/logic/variantmodule.ts

/**
 * The contract a variant script implements, declared here at the layer that consumes
 * it: the logic reads a variant it is handed, without knowing which variants exist.
 */

import type { Movesets } from './movesets.js';
import type { CoordsKey } from '../../util/coordutil.js';
import type { Promotion } from '../util/gamerules.js';
import type { GameruleWinCondition } from '../util/winconutil.js';
import type { BoundingBox, UnboundedRectangle } from '../../util/math/bounds.js';
import type { SpecialMoveFunction, SpecialVicinity } from './specialmove.js';
import type { Player, PlayerGroup, RawType, RawTypeGroup } from '../../util/typeutil.js';

// Types -----------------------------------------------------------------------

/**
 * The shape of a dynamically imported variant script module.
 *
 * Rules that read as derivable from the starting position — `promotion.pieces`, `worldBorder` —
 * are still stated outright here, since deriving them means processing the whole position.
 * They must therefore be revised (and time-versioned) alongside any change to that position.
 */
export interface VariantModule {
	/** Returns the variant's position at the given timestamp. */
	getPosition: (timestamp?: number) => {
		position: Map<CoordsKey, number>;
		/**
		 * Provided for string-based variants, generator-based variants omit it
		 * (their specialRights are derived separately from their generator rules instead).
		 */
		specialRights?: Set<CoordsKey>;
	};
	/** Returns the gamerule modifications for this variant at the given timestamp, if it has any. */
	gameruleModifications?: (timestamp?: number) => GameRuleModifications;
	/**
	 * Returns the length of the raw ICN position string for this variant at the resolved timestamp.
	 * Only present on string-based variants, generator-based variants omit this.
	 */
	getPositionStringLength?: (timestamp?: number) => number;
	/**
	 * Returns the bounding box of the starting position at the resolved timestamp. Declared so an
	 * engine game's world border can be spaced evenly around the position without generating it.
	 * Required of every variant the engine supports that declares no `worldBorder` of its own.
	 */
	getPositionBox?: (timestamp?: number) => BoundingBox;
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

/** An object that describes what modifications to make to default gamerules in a variant. */
export type GameRuleModifications = {
	moveRule?: number | null;
	turnOrder?: Player[];
	winConditions?: PlayerGroup<GameruleWinCondition[]>;
	promotion?: PromotionModifications | null;
	worldBorder?: UnboundedRectangle;
};

type PromotionModifications = {
	ranks?: Promotion['ranks'];
	pieces?: Promotion['pieces'];
};
