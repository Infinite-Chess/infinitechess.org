// src/shared/chess/variantgroups/variantgroups.ts

/*
 * Manager script of all the variant groups.
 *
 * A variant group categorizes variants by alike gamerules.
 * This can be win conditions, player to move, piece movement, etc.
 * Each group stores its own variant dictionary: the source of truth each of its
 * variant's starting position, gamerule overrides, and moveset/special-move overrides.
 *
 * Existing groups are: Standard, Horde, 4D, and Showcase.
 */

import type { Movesets } from '../logic/movesets.js';
import type { CoordsKey } from '../util/coordutil.js';
import type { GameruleWinCondition } from '../util/winconutil.js';
import type { RawType, Player, PlayerGroup } from '../util/typeutil.js';
import type { SpecialMoveFunction, SpecialVicinity } from '../logic/specialmove.js';

import group4d, { VariantCode_4D } from './group4d/group4d.js';
import grouphorde, { VariantCode_Horde } from './grouphorde.js';
import groupstandard, { VariantCode_Standard } from './groupstandard.js';
import groupshowcase, { VariantCode_Showcase } from './groupshowcase.js';

// Types -------------------------------------------------------------------------------

/**
 * A single variant entry object.
 *
 * A variant may contain either the `positionString` property, or `algorithm` property,
 * and may contain a `gameruleModifications` property (if not specified, default gamerules are used).
 *
 * `positionString` is in the same format as ICN.
 * `algorithm` needs to contain properties `algorithm`, and `rules`, the first of which points to a function
 * that returns a position in key format `{ 'x,y':'type' }`, and the second of which is an object which may
 * contain `pawnDoublePush` and `castleWith` properties, seeing as that info is not present in positional data.
 *
 * If either `positionString` or `gameruleModifications` has different values for different points
 * in time (variant has received an update), then it may contain nested UTC timestamps representing
 * the new values after that point in time.
 */
export type Variant = {
	/** The English display name of the variant, used in game metadata (e.g. "Chess on an Infinite Plane"). */
	name: string;
	/**
	 * A function that returns the movesetModifications for the variant.
	 * The movesetModifications do NOT need to contain the movesets of every piece,
	 * but only of the pieces you do not want to use their default movement!
	 */
	movesetGenerator?: TimeVariantProperty<() => Movesets>;
	gameruleModifications: TimeVariantProperty<GameRuleModifications>;
	/** Special Move overrides */
	specialMoves?: TimeVariantProperty<{
		[piece: string]: SpecialMoveFunction;
	}>;
	/**
	 * Used for check calculation.
	 * If we have any overrides for specialMoves, we should have overrides for
	 * this, because it means the piece could make captures on different locations.
	 */
	specialVicinity?: TimeVariantProperty<SpecialVicinity>;
	/**
	 * Permanent preset annotations. Can't be erased.
	 * Helpful for emphasizing important lines/squares in showcasings.
	 */
	annotePresets?: {
		/** In compacted string form: '23,94|23,76' */
		squares?: string;
		/** In compacted string form: '23,94>-1,0|23,76>-1,0' */
		rays?: string;
	};
	/** If present, its how many squares of padding exist between the furthest piece on each side to the world border. */
	worldBorderDist?: bigint;
} & (
	| {
			/** The position string of the variant, in the same format as ICN. */
			positionString: TimeVariantProperty<string>;
			generator?: never;
	  }
	| {
			/** A function that generates the starting position of the variant, in key format `{ 'x,y':'type' }`. */
			generator: {
				algorithm: () => Map<CoordsKey, number>;
				rules: {
					pawnDoublePush: boolean;
					castleWith?: RawType;
				};
			};
			positionString?: never;
	  }
);

/** An object that describes what modifications to make to default gamerules in a variant. */
export type GameRuleModifications = {
	moveRule?: number | null;
	turnOrder?: Player[];
	winConditions?: PlayerGroup<GameruleWinCondition[]>;
} & (
	| { promotionsAllowed?: RawType[]; promotionRanks?: PlayerGroup<bigint[]> }
	| { promotionsAllowed: null; promotionRanks?: never }
);

/** Keys (if present) should be timestamps */
export type TimeVariantProperty<T> =
	| T
	| {
			[timestamp: number]: T;
	  };

export type VariantInfo =
	| {
			group: 'standard';
			name: VariantCode_Standard;
	  }
	| {
			group: 'horde';
			name: VariantCode_Horde;
	  }
	| {
			group: '4D';
			name: VariantCode_4D;
	  }
	| {
			group: 'showcase';
			name: VariantCode_Showcase;
	  };

// ====================================== VARIANT DICTIONARY ======================================

// Claude: place new dictionary here!

// Functions ---------------------------------------------------------------------------------

/**
 * Type helper: validates each variant entry against the Variant interface while preserving
 * the literal key names, so that `keyof typeof variantDictionary` remains a union of
 * specific string literals and every lookup returns `Variant` instead of a narrow union.
 */
function buildVariantDictionary<K extends string>(dict: { [key in K]: Variant }): {
	[key in K]: Variant;
} {
	return dict;
}
/**
 * Tests if the provided variant is a valid variant.
 * Acts as a type guard, narrowing the input to {@link VariantCode}.
 * @param variantName - The name of the variant
 * @returns Whether the variant is a valid variant
 */
function isVariantValid(variant: { group: string; name: string }): variant is VariantInfo {
	switch (variant.group) {
		case 'standard':
			return variant.name in groupstandard.variantDictionary;
		case 'horde':
			return variant.name in grouphorde.variantDictionary;
		case '4D':
			return variant.name in group4d.variantDictionary;
		case 'showcase':
			return variant.name in groupshowcase.variantDictionary;
		default:
			return false;
	}
}

/** Takes a variant group & code and returns its English display name. */
function getVariantName(variantInfo: VariantInfo): string {
	switch (variantInfo.group) {
		case 'standard':
			return groupstandard.variantDictionary[variantInfo.name].name;
		case 'horde':
			return grouphorde.variantDictionary[variantInfo.name].name;
		case '4D':
			return group4d.variantDictionary[variantInfo.name].name;
		case 'showcase':
			return groupshowcase.variantDictionary[variantInfo.name].name;
	}
}

// Exports ----------------------------------------------------------

export default {
	// Functions
	buildVariantDictionary,
	isVariantValid,
	getVariantName,
};
