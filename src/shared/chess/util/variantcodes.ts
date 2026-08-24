// src/shared/chess/util/variantcodes.ts

/**
 * The name of every variant the site knows, in display order.
 *
 * Deliberately separate from variantregistry.ts, which pairs each code with its
 * dynamic import: a loader's type reaches into the game logic, while a code is
 * plain vocabulary that a board carries around.
 */

/** Every valid variant code, in registry order. Does not include custom variants. */
export const VARIANT_CODES = [
	// Standard
	'Classical',
	'Core',
	'Standarch',
	'Space_Classic',
	'CoaIP',
	'Space',
	'Obstocean',
	'Chess',
	'Confined_Classical',
	'Classical_Plus',
	'Pawndard',
	'Knightline',
	'Palace',
	'CoaIP_HO',
	'CoaIP_RO',
	'CoaIP_NO',
	// Deleted variants, kept to support pasting old game notation.
	'Knighted_Chess',
	'Abundance',
	'Amazon_Chandelier',
	'Containment',
	// Horde
	'Pawn_Horde',
	// 4D
	'4x4x4x4_Chess',
	'5D_Chess',
	// Showcase
	'Omega',
	'Omega_Squared',
	'Omega_Cubed',
	'Omega_Fourth',
] as const;

/** Union of all valid variant codes. */
export type VariantCode = (typeof VARIANT_CODES)[number];
