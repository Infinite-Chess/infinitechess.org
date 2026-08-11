// src/client/scripts/esm/game/chess/clientmetadatautil.ts

/**
 * Client-side helpers for building and parsing ICN game metadata.
 */

import type { GameFile } from '../../../../../shared/chess/logic/gamefile.js';
import type { MetaData, Rating } from '../../../../../shared/domain.js';
import type { Condition, GameConclusion } from '../../../../../shared/chess/util/winconutil.js';

import * as z from 'zod';

import timeutil from '../../../../../shared/util/timeutil.js';
import winconutil from '../../../../../shared/chess/util/winconutil.js';
import metadatautil from '../../../../../shared/chess/util/metadatautil.js';
import { players as p } from '../../../../../shared/chess/util/typeutil.js';
import variantregistry, {
	VariantCode,
} from '../../../../../shared/chess/variants/variantregistry.js';

// Functions -----------------------------------------------------------------------

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
			gamefile.gameRules,
			gamefile.gameConclusion.condition,
		);
	}
	return metadata;
}

/**
 * The metadata declaring which variant, at which revision of it, a position was sourced from —
 * everything an explicit position needs to still identify its origin. Empty for a game with no
 * variant, since the date alone declares no provenance.
 */
function buildSourceVariantMetadata(gamefile: GameFile): MetaData {
	if (!gamefile.variant) return {};
	const { UTCDate, UTCTime } = timeutil.convertTimestampToUTCDateUTCTime(gamefile.dateTimestamp);
	return {
		Variant: variantregistry.getVariantName(gamefile.variant.code, t.shared),
		UTCDate,
		UTCTime,
	};
}

/** Calculates the game conclusion from the Result metadata and termination CODE. */
function getGameConclusionFromResultAndTermination(
	result: string,
	termination: Condition,
): GameConclusion {
	// prettier-ignore
	const victor =
		result === '1-0' ? p.WHITE :
		result === '0-1' ? p.BLACK :
		result === '1/2-1/2' ? null :
		result === '*' ? undefined :
		((): never => { throw Error(`Unsupported result (${result})!`); })();

	const gameConclusion: any = { condition: termination };
	// Only attach victor if it is defined
	if (victor !== undefined) gameConclusion.victor = victor;

	// Make sure it's type safe
	const parseResult = winconutil.gameConclusionSchema.safeParse(gameConclusion);
	if (!parseResult.success)
		throw new Error(
			`When parsing GameConclusion from metadata, condition "${termination}" and victor "${victor}" is an invalid combination. ZodError: ${z.prettifyError(parseResult.error)}`,
		);
	return parseResult.data;
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

// Exports -----------------------------------------------------------------------

export default {
	buildMetaDataFromGamefile,
	buildSourceVariantMetadata,
	getGameConclusionFromResultAndTermination,
	getRatingFromWhiteBlackElo,
	resolveAndNormalizeVariantFromMetadata,
};
