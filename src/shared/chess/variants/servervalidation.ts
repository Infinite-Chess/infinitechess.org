// src/shared/chess/variants/servervalidation.ts

/**
 * This script defines which variants support server-side move legality validation.
 *
 * Variants with a position string length <= MAX_SERVER_VALIDATABLE_POSITION_LENGTH are
 * considered supported. Variants with large position strings (like Omega Squared and above) or
 * generator-based variants are excluded to avoid server hitches on legal move gen.
 */

import type { Player } from '../../util/typeutil.js';
import type { VariantCode } from '../util/variantcodes.js';
import type { TimeControl } from '../../chess/util/clockutil.js';
import type { GameModifier } from '../../util/modutil.js';
import type { LoadedVariant } from '../logic/gamefile.js';
import type { GameStateVariant, SeekVariant } from '../../chess/variants/variantselection.js';

import variantpreviewer from '../logic/variantpreviewer.js';
import { VariantLeaderboards } from './validleaderboard.js';

// Constants -----------------------------------------------------------------

/**
 * The maximum position string length (in characters) for a
 * position to be eligible for server-side move validation.
 * Obstocean (length 2425) is the largest supported variant.
 * Omega Squared and above (length > 2500) are excluded.
 */
const MAX_SERVER_VALIDATABLE_POSITION_LENGTH = 2500;

/**
 * Variants whose starting position is too large to
 * include in an ICN string or to generate server-side.
 * Auto-reject these variants for seeks.
 */
const VARIANTS_TOO_LARGE_TO_INCLUDE_POSITION: VariantCode[] = [
	'Omega_Squared',
	'Omega_Cubed',
	'Omega_Fourth',
	'5D_Chess',
];

// Functions -----------------------------------------------------------------

/**
 * Returns `true` if the given variant supports server-side move legality validation.
 * Variants whose position string exceeds {@link MAX_SERVER_VALIDATABLE_POSITION_LENGTH}
 * characters, or that use position generators, are not supported.
 * @param variant - The loaded variant, if available.
 */
function doesVariantSupportServerValidation(variant: LoadedVariant | undefined): boolean {
	if (variant === undefined) return false;
	const positionStringLength = variantpreviewer.getVariantPositionStringLength(variant);
	if (positionStringLength === undefined) return false; // Generator-based variant
	return positionStringLength <= MAX_SERVER_VALIDATABLE_POSITION_LENGTH;
}

/**
 * Returns `true` if the server validates every move of the game against its own board —
 * making cheating impossible, so the game is finalized (result locked in) the instant
 * it concludes.
 * @param variant - What the game is played with.
 * @param loaded - The loaded variant its board was built from. Read only for a preset game:
 *   a custom game's source variant says nothing about the size of the position it was lifted from.
 */
function isGameServerValidated(
	variant: GameStateVariant,
	loaded: LoadedVariant | undefined,
): boolean {
	// Always true, never measured: validatePosition() holds custom positions to
	// MAX_SERVER_VALIDATABLE_POSITION_LENGTH — the preset bound — before a seek exists.
	if (variant.kind === 'custom') return true;
	return doesVariantSupportServerValidation(loaded);
}

/**
 * Returns `true` if the given seek options are eligible for a rated game.
 * Mirrors the server-side seek validation logic to avoid redundant checks.
 */
function isRatedAllowed(
	variant: SeekVariant | null,
	time: TimeControl,
	color: Player | null,
	modifiers: GameModifier[] | undefined,
): boolean {
	if (variant === null) return false;
	if (variant.kind !== 'preset') return false; // Custom variants are never rated
	if (!(variant.code in VariantLeaderboards)) return false; // Variant needs a leaderboard
	if (time === '-') return false; // Must be timed
	if (color !== null) return false; // No specific color for rated **public** games
	if ((modifiers?.length ?? 0) > 0) return false; // No modifiers for rated
	return true;
}

export {
	MAX_SERVER_VALIDATABLE_POSITION_LENGTH,
	VARIANTS_TOO_LARGE_TO_INCLUDE_POSITION,
	doesVariantSupportServerValidation,
	isGameServerValidated,
	isRatedAllowed,
};
