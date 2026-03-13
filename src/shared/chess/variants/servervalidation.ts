// src/shared/chess/variants/servervalidation.ts

/**
 * This script defines which variants support server-side move legality validation.
 *
 * Variants with a position string length <= POSITION_STRING_THRESHOLD are considered
 * supported. Variants with large position strings (like Omega Squared and above) or
 * generator-based variants are excluded to avoid server hitches on legal move gen.
 */

import type { MetaData } from '../util/metadata.js';

import variant from './variant.js';

/**
 * The maximum position string length (in characters) for a variant to be
 * eligible for server-side move validation.
 * Obstocean (length 2425) is the largest supported variant.
 * Omega Squared and above (length > 2500) are excluded.
 */
const POSITION_STRING_THRESHOLD = 2500;

/**
 * Returns `true` if the given variant supports server-side move legality validation.
 * Variants whose position string exceeds {@link POSITION_STRING_THRESHOLD} characters,
 * or that use position generators, are not supported.
 * @param metadata - Metadata of the game (including `Variant`, `UTCDate`, `UTCTime`).
 */
function doesVariantSupportServerValidation(metadata: MetaData): boolean {
	const positionString = variant.getVariantPositionString(metadata);
	if (positionString === undefined) return false; // Generator-based or invalid variant
	return positionString.length <= POSITION_STRING_THRESHOLD;
}

export { doesVariantSupportServerValidation };
