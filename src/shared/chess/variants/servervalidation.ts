// src/shared/chess/variants/servervalidation.ts

/**
 * This script defines which variants support server-side move legality validation.
 *
 * Variants with a position string length <= gamelimits's MAX_SERVER_VALIDATABLE_POSITION_LENGTH are
 * considered supported. Variants with large position strings (like Omega Squared and above) or
 * generator-based variants are excluded to avoid server hitches on legal move gen.
 */

import type { VariantCode } from '../util/variantcodes.js';
import type { LoadedVariant } from '../logic/gamefile.js';
import type { GameStateVariant } from '../util/variantselection.js';

import gamelimits from '../util/gamelimits.js';
import variantrules from '../logic/variantrules.js';

// Constants -------------------------------------------------------------------

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

// Functions -------------------------------------------------------------------

/**
 * Returns `true` if the given variant supports server-side move legality validation.
 * Variants whose position string exceeds {@link gamelimits.MAX_SERVER_VALIDATABLE_POSITION_LENGTH}
 * characters, or that use position generators, are not supported.
 * @param variant - The loaded variant, if available.
 */
function doesVariantSupportServerValidation(variant: LoadedVariant | undefined): boolean {
	if (variant === undefined) return false;
	const positionStringLength = variantrules.getVariantPositionStringLength(variant);
	if (positionStringLength === undefined) return false; // Generator-based variant
	return positionStringLength <= gamelimits.MAX_SERVER_VALIDATABLE_POSITION_LENGTH;
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
	// gamelimits.MAX_SERVER_VALIDATABLE_POSITION_LENGTH — the preset bound — before a seek exists.
	if (variant.kind === 'custom') return true;
	return doesVariantSupportServerValidation(loaded);
}

export {
	VARIANTS_TOO_LARGE_TO_INCLUDE_POSITION,
	doesVariantSupportServerValidation,
	isGameServerValidated,
};
