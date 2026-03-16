// src/shared/chess/variants/servervalidation.ts

/**
 * This script defines which variants support server-side move legality validation.
 *
 * Variants with a position string length <= POSITION_STRING_THRESHOLD are considered
 * supported. Variants with large position strings (like Omega Squared and above) or
 * generator-based variants are excluded to avoid server hitches on legal move gen.
 */

import type { VariantCode } from './variant.js';

import variant from './variant.js';

// Constants -----------------------------------------------------------------

/**
 * The maximum position string length (in characters) for a variant to be
 * eligible for server-side move validation.
 * Obstocean (length 2425) is the largest supported variant.
 * Omega Squared and above (length > 2500) are excluded.
 */
const POSITION_STRING_THRESHOLD = 2500;

// Functions -----------------------------------------------------------------

/**
 * Returns `true` if the given variant supports server-side move legality validation.
 * Variants whose position string exceeds {@link POSITION_STRING_THRESHOLD} characters,
 * or that use position generators, are not supported.
 * @param variantCode - The strongly-typed variant code, or undefined.
 * @param timestamp - The game's start timestamp in ms since epoch.
 */
function doesVariantSupportServerValidation(
	variantCode: VariantCode | undefined,
	timestamp: number,
): boolean {
	if (variantCode === undefined) return false;
	const positionString = variant.getVariantPositionString(variantCode, timestamp);
	if (positionString === undefined) return false; // Generator-based variant
	return positionString.length <= POSITION_STRING_THRESHOLD;
}

/**
 * Returns `true` if the game is deleted instantly on conclusion — meaning the server
 * either validated every move (cheating is impossible) or it's a private game (cheat
 * reports are not allowed). In both cases:
 * - The server removes players from the active-games list immediately.
 * - Clients do not need to send `removefromplayersinactivegames`.
 * - Clients should not send cheat reports.
 * @param variantCode - The strongly-typed variant code, or undefined.
 * @param timestamp - The game's start timestamp in ms since epoch.
 * @param isPrivate - Whether the game is a private match.
 */
function isGameInstantlyDeleted(
	variantCode: VariantCode | undefined,
	timestamp: number,
	isPrivate: boolean,
): boolean {
	return doesVariantSupportServerValidation(variantCode, timestamp) || isPrivate;
}

export { doesVariantSupportServerValidation, isGameInstantlyDeleted };
