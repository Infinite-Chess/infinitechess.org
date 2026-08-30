// src/client/scripts/esm/chess/clientmetadatautil.ts

/**
 * Client-side helpers for building and parsing ICN game metadata.
 */

import type { GameFile } from '../../../../shared/chess/logic/gamefile.js';
import type {
	MetaData,
	Rating,
	SourceVariantMetaData,
} from '../../../../shared/chess/util/metadatautil.js';

import timeutil from '../../../../shared/util/timeutil.js';
import winconutil from '../../../../shared/chess/util/winconutil.js';
import metadatautil from '../../../../shared/chess/util/metadatautil.js';
import variantregistry from '../../../../shared/chess/variants/variantregistry.js';
import { VariantCode } from '../../../../shared/chess/util/variantcodes.js';

// Functions -------------------------------------------------------------------

/**
 * Builds a {@link MetaData} on demand from a loaded
 * gamefile's properties, for serializing the game to ICN.
 *
 * Player identity (`White`/`Black`/elos) is NOT represented — the client gamefile
 * does not store it; the authoritative, complete ICN comes from the server.
 */
function buildMetaDataFromGamefile(gamefile: GameFile): MetaData {
	const { UTCDate, UTCTime } = timeutil.convertTimestampToUTCDateUTCTime(gamefile.dateTimestamp);
	const metadata: MetaData = {
		Site: 'https://www.infinitechess.org/',
		Round: '-',
		TimeControl: gamefile.timeControl,
		UTCDate,
		UTCTime,
		// Adds the Variant tag (alongside the same date pair) when the game declares one.
		...buildSourceVariantMetadata(gamefile),
	};
	if (gamefile.gameConclusion) {
		metadata.Result = metadatautil.getResultFromVictor(gamefile.gameConclusion.victor);
		metadata.Termination = winconutil.getTerminationInEnglish(
			gamefile.gameRules.moveRule,
			gamefile.gameConclusion.condition,
		);
	}
	return metadata;
}

/**
 * Builds the {@link metadatautil.SOURCE_VARIANT_METADATA} tags from a loaded gamefile.
 * Empty for a game with no variant, since the date alone declares no provenance.
 */
function buildSourceVariantMetadata(gamefile: GameFile): SourceVariantMetaData {
	if (!gamefile.variant) return {};
	const { UTCDate, UTCTime } = timeutil.convertTimestampToUTCDateUTCTime(gamefile.dateTimestamp);
	return {
		Variant: variantregistry.getVariantName(gamefile.variant.code, t.shared),
		UTCDate,
		UTCTime,
	};
}

/**
 * Parses the elo and confidence from WhiteElo/BlackElo metadata.
 * ONLY HAS AS MUCH PRECISION as what's in the metadata.
 * DOES NOT KNOW whether their current rating is now confident, if thir WhiteElo/BlackElo was not confident.
 */
function getRatingFromWhiteBlackElo(whiteBlackElo: string): Rating {
	const [elo, emptyStr] = whiteBlackElo.split('?'); // emptyStr will be '' if the '?' is present, otherwise it will be undefined.
	return {
		value: Number(elo),
		confident: emptyStr === undefined,
	};
}

/**
 * Resolves the variant from the metadata, normalizes the metadata's
 * `Variant` property to the English display name (if recognized),
 * or deletes it (if not recognized), then returns the resolved {@link VariantCode}.
 * MUTATES the input metadata object.
 */
function resolveAndNormalizeVariantFromMetadata(metadata: {
	Variant?: string;
}): VariantCode | undefined {
	if (!metadata.Variant) return undefined;
	const resolved = variantregistry.resolveVariantCode(metadata.Variant);
	if (resolved !== undefined) {
		// Normalize to English display name
		metadata.Variant = variantregistry.getVariantName(resolved, t.shared);
	} else {
		// Unrecognized Variant: Treat as if no variant was specified
		delete metadata.Variant;
	}
	return resolved;
}

// Exports ---------------------------------------------------------------------

export default {
	buildMetaDataFromGamefile,
	buildSourceVariantMetadata,
	getRatingFromWhiteBlackElo,
	resolveAndNormalizeVariantFromMetadata,
};
