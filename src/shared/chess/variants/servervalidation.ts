// src/shared/chess/variants/servervalidation.ts

/**
 * This script defines which variants support server-side move legality validation.
 *
 * Variants with a position string length <= POSITION_STRING_THRESHOLD are considered
 * supported. Variants with large position strings (like Omega Squared and above) or
 * generator-based variants are excluded to avoid server hitches on legal move gen.
 */

import type { LoadedVariant } from '../logic/fullgame.js';

import variantreader from './variantreader.js';

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
 * @param variant - The loaded variant, if available.
 * @param timestamp - The game's start timestamp in ms since epoch.
 */
function doesVariantSupportServerValidation(
	variant: LoadedVariant | undefined,
	timestamp: number,
): boolean {
	if (variant === undefined) return false;
	const positionStringLength = variantreader.getVariantPositionStringLength(
		variant.mod,
		timestamp,
	);
	if (positionStringLength === undefined) return false; // Generator-based variant
	return positionStringLength <= POSITION_STRING_THRESHOLD;
}

/**
 * DELETE UNNECESSARY WRAPPER once the `private` game flag has been unused for a while.
 *
 * Returns `true` if the game is deleted instantly on conclusion — meaning the server
 * either validated every move (cheating is impossible) or it's a private game (cheat
 * reports are not allowed). In both cases:
 * - The server removes players from the active-games list immediately.
 * - Clients do not need to send `removefromplayersinactivegames`.
 * - Clients should not send cheat reports.
 * @param variant - The loaded variant, if available.
 * @param timestamp - The game's start timestamp in ms since epoch.
 * @param isPrivate - Whether the game is a private match.
 */
function isGameInstantlyDeleted(variant: LoadedVariant | undefined, timestamp: number): boolean {
	return doesVariantSupportServerValidation(variant, timestamp);
}

export { doesVariantSupportServerValidation, isGameInstantlyDeleted };
