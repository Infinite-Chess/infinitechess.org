// src/shared/chess/variants/variant_scripts/variantutil.ts

import type { Movesets } from '../../logic/movesets.js';
import type { CoordsKey } from '../../util/coordutil.js';
import type { Promotion } from '../../util/gamerules.js';
import type { GameruleWinCondition } from '../../util/winconutil.js';
import type { SpecialMoveFunction, SpecialVicinity } from '../../logic/specialmove.js';
import type { Player, PlayerGroup, RawType, RawTypeGroup } from '../../util/typeutil.js';

/** The shape of a dynamically imported variant script module. */
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
	/** If present, it's how many squares of padding exist between the furthest piece on each side to the world border. */
	worldBorderDist?: bigint;
	/**
	 * Returns the length of the raw ICN position string for this variant at the resolved timestamp.
	 * Only present on string-based variants, generator-based variants omit this.
	 */
	getPositionStringLength?: (timestamp?: number) => number;
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
};

type PromotionModifications = {
	ranks?: Promotion['ranks'];
	pieces?: Promotion['pieces'];
};

/**
 * Selects the value from a time-versioned record whose key is the highest timestamp
 * less than or equal to the given timestamp. Falls back to the earliest entry if none apply.
 */
function resolveAtTimestamp<T>(entries: Record<number, T>, timestamp: number): T {
	const keys = Object.keys(entries)
		.map(Number)
		.sort((a, b) => b - a);
	return entries[keys.find((k) => timestamp >= k) ?? keys[keys.length - 1]!]!;
}

export default {
	resolveAtTimestamp,
};
