// src/shared/chess/logic/icn/icnimport.ts

/**
 * Utilities for importing and resolving game data from pasted ICN strings.
 * Handles position resolution whether the ICN contains an explicit position
 * or only variant metadata.
 */

import type { CoordsKey } from '../../util/coordutil.js';
import type { VariantCode } from '../../variants/variantregistry.js';
import type { LongFormatOut } from './icnconverter.js';
import type { LoadedVariant, VariantOptions } from '../gamefile.js';

import metadatautil from '../../util/metadatautil.js';
import variantcache from '../../variants/variantcache.js';
import variantpreviewer from '../../variants/variantpreviewer.js';

/**
 * Resolves the starting position and specialRights from a parsed ICN long format.
 * Uses the explicit position if present, otherwise loads it from the variant.
 * @param variantCode - The pre-resolved variant code (avoids re-resolving from metadata).
 */
async function getPositionAndSpecialRightsFromLongFormat(
	longFormat: LongFormatOut,
	variantCode: VariantCode | undefined,
): Promise<{
	position: Map<CoordsKey, number>;
	specialRights: Set<CoordsKey>;
}> {
	if (longFormat.position && longFormat.state_global.specialRights) {
		return {
			position: longFormat.position,
			specialRights: longFormat.state_global.specialRights,
		};
	} else if (variantCode !== undefined) {
		// No position specified in the ICN, extract from the variant
		const dateTimestamp = metadatautil.resolveTimestampFromMetadata(longFormat.metadata.UTCDate, longFormat.metadata.UTCTime); // prettier-ignore
		await variantcache.ensureVariantLoaded(variantCode);
		const mod = variantcache.getModule(variantCode);
		const variant: LoadedVariant = { code: variantCode, mod, dateTimestamp };
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
		gameRules: longFormat.gameRules,
		state_global: { ...longFormat.state_global, specialRights },
		fullMove: overrides?.fullMove ?? longFormat.fullMove,
	};
}

export default {
	getPositionAndSpecialRightsFromLongFormat,
	variantOptionsFromLongFormat,
};
