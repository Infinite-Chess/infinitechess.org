// src/shared/chess/logic/icn/icnimport.ts

/**
 * Utilities for importing and resolving game data from pasted ICN strings.
 * Handles position resolution whether the ICN contains an explicit position
 * or only variant metadata.
 */

import type { CoordsKey } from '../../../util/coordutil.js';
import type { MovePacket } from '../../../chess/logic/icn/icnconverter.js';
import type { LongFormatOut, MoveParsed } from './icnconverter.js';
import type { LoadedVariant, VariantOptions } from '../gamefile.js';

import jsutil from '../../../util/jsutil.js';
import variantpreviewer from '../variantpreviewer.js';

/**
 * Resolves the starting position and specialRights from a parsed ICN long format.
 * Uses the explicit position if present, otherwise reads it from the variant.
 * @param variant - The variant the ICN declares, module already resolved. Only consulted
 *   when the ICN carries no position of its own; pass undefined to resolve to an empty one.
 */
function getPositionAndSpecialRightsFromLongFormat(
	longFormat: LongFormatOut,
	variant: LoadedVariant | undefined,
): {
	position: Map<CoordsKey, number>;
	specialRights: Set<CoordsKey>;
} {
	if (longFormat.position && longFormat.state_global.specialRights) {
		return {
			position: longFormat.position,
			specialRights: longFormat.state_global.specialRights,
		};
	} else if (variant !== undefined) {
		// No position specified in the ICN, extract from the variant
		return variantpreviewer.getStartingPositionOfVariant(variant);
	} else {
		return { position: new Map(), specialRights: new Set() };
	}
}

/**
 * Constructs a {@link VariantOptions} object from a parsed ICN long format.
 * Defaults `position` to an empty map and `specialRights` to an empty set if absent.
 * Pass `overrides` to supply externally resolved values or to override `fullMove`.
 */
function variantOptionsFromLongFormat(
	longFormat: LongFormatOut,
	overrides?: {
		position?: Map<CoordsKey, number>;
		specialRights?: Set<CoordsKey>;
		fullMove?: number;
	},
): VariantOptions {
	const position = overrides?.position ?? longFormat.position ?? new Map();
	const specialRights =
		overrides?.specialRights ?? longFormat.state_global.specialRights ?? new Set();
	return {
		position,
		// Copied — construction writes to it (slideLimit, worldBorder, winConditions).
		gameRules: jsutil.deepCopyObject(longFormat.gameRules),
		state_global: { ...longFormat.state_global, specialRights },
		fullMove: overrides?.fullMove ?? longFormat.fullMove,
	};
}

/**
 * Maps parsed ICN moves to wire {@link MovePacket}s, keeping only the
 * token + clock stamp (dropping parse-only extras like comments and coords).
 */
function movePacketsFromParsed(moves: MoveParsed[]): MovePacket[] {
	return moves.map((m) => {
		const move: MovePacket = { token: m.token };
		if (m.clockStamp !== undefined) move.clockStamp = m.clockStamp;
		return move;
	});
}

export default {
	getPositionAndSpecialRightsFromLongFormat,
	variantOptionsFromLongFormat,
	movePacketsFromParsed,
};
