// src/shared/chess/util/metadatautil.ts

/**
 * This script stores the type definition for a game's metadata.
 *
 * ICN (Infinite Chess Notation) is inspired from PGN notation.
 * https://github.com/tsevasa/infinite-chess-notation
 */

import type { Player } from './typeutil.js';
import type { MetaData, Rating } from '../../types.js';

import { players as p } from './typeutil.js';

// Types --------------------------------------------------------------------------

/** All valid metadata names. */
export type MetadataKey = keyof MetaData;

// Constants -----------------------------------------------------------------------

/** Canonical display name used for guest players in ICN metadata. Metadata is always in English. */
const GUEST_NAME_ICN_METADATA = '(Guest)' as const;

// Functions -----------------------------------------------------------------------

/**
 * Returns the value of the game's Result metadata, depending on the victor.
 * @param victor - The victor of the game, in player number. Or none if undefined.
 * @returns The result of the game in the format '1-0', '0-1', '1/2-1/2', or '*' (aborted).
 */
function getResultFromVictor(victor?: Player | null): string {
	if (victor === p.WHITE) return '1-0';
	else if (victor === p.BLACK) return '0-1';
	else if (victor === null) return '1/2-1/2';
	else if (victor === undefined) return '*';
	throw new Error(`Cannot get game result from unsupported victor ${victor}!`);
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
	getResultFromVictor,
	getFormattedElo,
	getWhiteBlackRatingDiff,
};
