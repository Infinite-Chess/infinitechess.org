// src/shared/chess/util/metadatautil.ts

/**
 * This script stores the type definition for a game's metadata,
 * and the helpers that format its values.
 *
 * ICN (Infinite Chess Notation) is inspired from PGN notation.
 * https://github.com/tsevasa/infinite-chess-notation
 */

import type { Player } from './typeutil.js';
import type { TimeControl } from './clockutil.js';

import * as z from 'zod';

import timeutil from '../../util/timeutil.js';
import { players as p } from './typeutil.js';

// Types -----------------------------------------------------------------------

/** A player's rating value and whether we are confident about it. */
export type Rating = z.infer<typeof RatingSchema>;
export const RatingSchema = z.strictObject({
	value: z.number(),
	confident: z.boolean(),
});

/**
 * ICN (Infinite Chess Notation) metadata for a game, inspired by PGN notation.
 * A plain type, not a schema — it is parsed out of an ICN, never off the wire.
 */
export interface MetaData {
	/** What kind of game (rated/casual), and variant, in spoken language. E.g. "Casual local Classical infinite chess game". */
	Event?: string;
	/** The website the game was played on, or the direct URL of the game. */
	Site?: string;
	/** The ID of the game in base 62, if applicable. */
	GameId?: string;
	TimeControl?: TimeControl;
	/** The round number. A pgn-required metadata with no current application to infinitechess.org. */
	Round?: '-';
	/** The UTC date of the game, in the format `"YYYY.MM.DD"`. */
	UTCDate?: string;
	/** The UTC time the game started, in the format `"HH:MM:SS"`. */
	UTCTime?: string;
	/** If it's not a custom position, this must be one of the valid variants. */
	Variant?: string;
	White?: string;
	Black?: string;
	/** The ID of the white player, if they are signed in, converted to base 62. */
	WhiteID?: string;
	/** The ID of the black player, if they are signed in, converted to base 62. */
	BlackID?: string;
	/** The display elo of the white player, which may include a "?" if we're uncertain about their rating. */
	WhiteElo?: string;
	/** The display elo of the black player, which may include a "?" if we're uncertain about their rating. */
	BlackElo?: string;
	/** How much elo white gained/lost from the match. */
	WhiteRatingDiff?: string;
	/** How much elo black gained/lost from the match. */
	BlackRatingDiff?: string;
	/** How many points each side received from the game (e.g. `"1-0"` means white won, `"1/2-1/2"` means a draw). */
	Result?: string;
	/** What caused the game to end, in spoken language. E.g. "Time forfeit". */
	Termination?: string;
}

/** All valid metadata names. */
type MetadataKey = keyof MetaData;

/** {@link MetaData} narrowed to the {@link SOURCE_VARIANT_METADATA} tags. */
export type SourceVariantMetaData = Pick<MetaData, (typeof SOURCE_VARIANT_METADATA)[number]>;

// Constants -------------------------------------------------------------------

/** Canonical display name used for guest players in ICN metadata. Metadata is always in English. */
const GUEST_NAME_ICN_METADATA = '(Guest)' as const;

/**
 * The tags declaring which variant, at which revision of it, a position was sourced from —
 * everything an explicit position needs to still identify its origin. `Variant` selects the
 * movesets, `UTCDate`/`UTCTime` pin which revision of that variant applies.
 */
const SOURCE_VARIANT_METADATA = ['Variant', 'UTCDate', 'UTCTime'] as const satisfies readonly MetadataKey[]; // prettier-ignore

// Functions -------------------------------------------------------------------

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
 * The game's Result metadata for a given victor: `'1-0'`, `'0-1'`,
 * `'1/2-1/2'` (draw, `null`), or `'*'` (aborted, `undefined`).
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

// Exports ---------------------------------------------------------------------

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
