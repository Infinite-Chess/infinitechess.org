// src/client/scripts/esm/game/chess/icnimport.ts

/**
 * Utilities for importing and resolving game data from pasted ICN strings.
 * Handles position resolution whether the ICN contains an explicit position
 * or only variant metadata.
 */

import type { CoordsKey } from '../../../../../shared/chess/util/coordutil.js';
import type { VariantCode } from '../../../../../shared/chess/variants/variantregistry.js';
import type { LongFormatOut } from '../../../../../shared/chess/logic/icn/icnconverter.js';

import variantcache from '../../../../../shared/chess/variants/variantcache.js';
import variantpreviewer from '../../../../../shared/chess/variants/variantpreviewer.js';

import clientmetadatautil from './clientmetadatautil.js';

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
		const timestamp = clientmetadatautil.resolveTimestampFromMetadata(longFormat.metadata.UTCDate, longFormat.metadata.UTCTime); // prettier-ignore
		await variantcache.ensureVariantLoaded(variantCode);
		const mod = variantcache.getModule(variantCode);
		return variantpreviewer.getStartingPositionOfVariant(mod, timestamp);
	} else {
		return { position: new Map(), specialRights: new Set() };
	}
}

export default {
	getPositionAndSpecialRightsFromLongFormat,
};
