// src/shared/chess/util/metadatautil.ts

/**
 * This script stores the type definition for a game's metadata.
 *
 * ICN (Infinite Chess Notation) is inspired from PGN notation.
 * https://github.com/tsevasa/infinite-chess-notation
 */

import type { Player } from '../../util/typeutil.js';
import type { MetaData, Rating } from '../../domain.js';

import timeutil from '../../util/timeutil.js';
import { players as p } from '../../util/typeutil.js';

// Types --------------------------------------------------------------------------

/** All valid metadata names. */
export type MetadataKey = keyof MetaData;

/** {@link MetaData} narrowed to the {@link SOURCE_VARIANT_METADATA} tags. */
export type SourceVariantMetaData = Pick<MetaData, (typeof SOURCE_VARIANT_METADATA)[number]>;

// Constants -----------------------------------------------------------------------

/** Canonical display name used for guest players in ICN metadata. Metadata is always in English. */
const GUEST_NAME_ICN_METADATA = '(Guest)' as const;

/**
 * The tags declaring which variant, at which revision of it, a position was sourced from —
 * everything an explicit position needs to still identify its origin. `Variant` selects the
 * movesets, `UTCDate`/`UTCTime` pin which revision of that variant applies.
 */
const SOURCE_VARIANT_METADATA = ['Variant', 'UTCDate', 'UTCTime'] as const satisfies readonly MetadataKey[]; // prettier-ignore

// Functions -----------------------------------------------------------------------

/**
 * Trims metadata down to the {@link SOURCE_VARIANT_METADATA} tags.
 * Everything else (player names, elo, result, ...) is bloat in an exported position.
 */
function trimToSourceVariantMetadata(metadata: MetaData): SourceVariantMetaData {
	const trimmed: SourceVariantMetaData = {};
	for (const key of SOURCE_VARIANT_METADATA) {
		if (metadata[key] !== undefined) trimmed[key] = metadata[key];
	}
	return trimmed;
}

/**
 * Resolves a timestamp (ms since epoch) from UTCDate and UTCTime metadata strings.
 * Falls back to the current time if UTCDate is not provided.
 * If UTCDate is provided but UTCTime is not, midnight (00:00:00) is assumed.
 */
function resolveTimestampFromMetadata(UTCDate?: string, UTCTime?: string): number {
	if (UTCDate !== undefined) return timeutil.convertUTCDateUTCTimeToTimeStamp(UTCDate, UTCTime);
	return Date.now();
}

/**
 * Returns the value of the game's Result metadata, depending on the victor.
 * @param victor - The victor of the game, in player number. Or none if undefined.
 * @returns The result of the game in the format '1-0', '0-1', '1/2-1/2', or '*' (aborted).
 * @throws If the victor is not one of the four valid values.
 */
function getResultFromVictor(victor?: Player | null): string {
	if (victor === p.WHITE) return '1-0';
	else if (victor === p.BLACK) return '0-1';
	else if (victor === null) return '1/2-1/2';
	else if (victor === undefined) return '*';
	throw new Error(`Cannot get game result from unsupported victor ${victor}!`);
}

/**
 * Resolves the victor from a Result string.
 * `'1/2-1/2'` (draw) yields `null`; `'*'` (aborted) yields `undefined`.
 * @throws If the result string is not one of the four valid values.
 */
function getVictorFromResult(result: string): Player | null | undefined {
	if (result === '1-0') return p.WHITE;
	else if (result === '0-1') return p.BLACK;
	else if (result === '1/2-1/2') return null;
	else if (result === '*') return undefined;
	throw new Error(`Cannot get victor from unsupported game result ${result}!`);
}

/** Rounds the elo. And, if we're not confident about its value, appends a question mark "?" to it. */
function getFormattedElo(rating: Rating): string {
	const roundedElo = Math.round(rating.value);
	return rating.confident ? `${roundedElo}` : `${roundedElo}?`;
}

/**
 * Takes elo change, calculates the string that should go into
 * the WhiteRatingDiff or BlackRatingDiff fields of the metadata.
 */
function getWhiteBlackRatingDiff(eloChange: number): string {
	const isPositive = eloChange >= 0;
	eloChange = Math.round(eloChange);
	return isPositive ? `+${eloChange}` : `${eloChange}`; // negative numbers are already negative
}

export default {
	GUEST_NAME_ICN_METADATA,
	SOURCE_VARIANT_METADATA,
	trimToSourceVariantMetadata,
	resolveTimestampFromMetadata,
	getResultFromVictor,
	getVictorFromResult,
	getFormattedElo,
	getWhiteBlackRatingDiff,
};
