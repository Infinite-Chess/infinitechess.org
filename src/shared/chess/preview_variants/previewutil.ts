// src/shared/chess/preview_variants/previewutil.ts

import type { CoordsKey } from '../util/coordutil';
import type { GameruleWinCondition } from '../util/winconutil';
import type { Player, PlayerGroup, RawType } from '../util/typeutil';

/** The shape of a dynamically imported preview script module. */
export interface PreviewModule {
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
}

/** An object that describes what modifications to make to default gamerules in a variant. */
export type GameRuleModifications = {
	moveRule?: number | null;
	turnOrder?: Player[];
	winConditions?: PlayerGroup<GameruleWinCondition[]>;
} & (
	| { promotionsAllowed?: RawType[]; promotionRanks?: PlayerGroup<bigint[]> }
	| { promotionsAllowed: null; promotionRanks?: never }
);

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
