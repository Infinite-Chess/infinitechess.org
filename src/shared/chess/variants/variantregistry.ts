// src/shared/chess/variants/variantregistry.ts

/**
 * Master registry of all variants.
 *
 * Stores variant's code, display name, and paths to their custom preview and load scripts.
 *
 * Existing groups are: Standard, Horde, 4D, and Showcase.
 */

// Types -------------------------------------------------------------------------------

/** All valid variant group names. */
export type VariantGroup = 'standard' | 'horde' | '4D' | 'showcase';

/** Union of all valid variant codes, derived from the keys of {@link VARIANT_REGISTRY}. */
export type VariantCode = (typeof VARIANT_CODES)[number];

export type VariantInfo = {
	group: VariantGroup;
	name: VariantCode;
};

/** Entry in the variant registry. */
export type VariantRegistryEntry = {
	/** The variant's group categorization. */
	group: VariantGroup;
	/** The English display name. */
	name: string;
	/**
	 * Absolute web path to the preview script, containing its position string and
	 * gamerule modifications, enough to render a preview tooltip of the variant.
	 */
	previewPath: string;
	/**
	 * Absolute web path to the load script, present only for variants with
	 * non-default movesets, special moves, special vicinity, or preset annotations.
	 */
	loadPath?: string;
};

// ====================================== VARIANT REGISTRY ======================================

const VARIANT_REGISTRY = {
	// ---- Standard ----
	Classical: {
		group: 'standard',
		name: 'Classical',
		previewPath: '/shared/chess/preview_variants/variants/prev_classical.js',
	},
	Core: {
		group: 'standard',
		name: 'Core',
		previewPath: '/shared/chess/preview_variants/variants/prev_core.js',
	},
	Standarch: {
		group: 'standard',
		name: 'Standarch',
		previewPath: '/shared/chess/preview_variants/variants/prev_standarch.js',
	},
	Space_Classic: {
		group: 'standard',
		name: 'Space Classic',
		previewPath: '/shared/chess/preview_variants/variants/prev_spaceclassic.js',
	},
	CoaIP: {
		group: 'standard',
		name: 'Chess on an Infinite Plane',
		previewPath: '/shared/chess/preview_variants/variants/prev_coaip.js',
	},
	Space: {
		group: 'standard',
		name: 'Space',
		previewPath: '/shared/chess/preview_variants/variants/prev_space.js',
	},
	Obstocean: {
		group: 'standard',
		name: 'Obstocean',
		previewPath: '/shared/chess/preview_variants/variants/prev_obstocean.js',
	},
	Chess: {
		group: 'standard',
		name: 'Chess',
		previewPath: '/shared/chess/preview_variants/variants/prev_chess.js',
	},
	Confined_Classical: {
		group: 'standard',
		name: 'Confined Classical',
		previewPath: '/shared/chess/preview_variants/variants/prev_confinedclassical.js',
	},
	Classical_Plus: {
		group: 'standard',
		name: 'Classical+',
		previewPath: '/shared/chess/preview_variants/variants/prev_classicalplus.js',
	},
	Pawndard: {
		group: 'standard',
		name: 'Pawndard',
		previewPath: '/shared/chess/preview_variants/variants/prev_pawndard.js',
	},
	Knightline: {
		group: 'standard',
		name: 'Knightline',
		previewPath: '/shared/chess/preview_variants/variants/prev_knightline.js',
	},
	Palace: {
		group: 'standard',
		name: 'Palace',
		previewPath: '/shared/chess/preview_variants/variants/prev_palace.js',
	},
	CoaIP_HO: {
		group: 'standard',
		name: 'Chess on an Infinite Plane - Huygens Option',
		previewPath: '/shared/chess/preview_variants/variants/prev_coaipho.js',
	},
	CoaIP_RO: {
		group: 'standard',
		name: 'Chess on an Infinite Plane - Roses Option',
		previewPath: '/shared/chess/preview_variants/variants/prev_coaipro.js',
	},
	CoaIP_NO: {
		group: 'standard',
		name: 'Chess on an Infinite Plane - Knightriders Option',
		previewPath: '/shared/chess/preview_variants/variants/prev_coaipno.js',
	},
	// Deleted variants, kept to support pasting old game notation.
	Knighted_Chess: {
		group: 'standard',
		name: 'Knighted Chess',
		previewPath: '/shared/chess/preview_variants/variants/prev_knightedchess.js',
	},
	Abundance: {
		group: 'standard',
		name: 'Abundance',
		previewPath: '/shared/chess/preview_variants/variants/prev_abundance.js',
	},
	Amazon_Chandelier: {
		group: 'standard',
		name: 'Amazon Chandelier',
		previewPath: '/shared/chess/preview_variants/variants/prev_amazonchandelier.js',
	},
	Containment: {
		group: 'standard',
		name: 'Containment',
		previewPath: '/shared/chess/preview_variants/variants/prev_containment.js',
	},
	// ---- Horde ----
	Pawn_Horde: {
		group: 'horde',
		name: 'Pawn Horde',
		previewPath: '/shared/chess/preview_variants/variants/prev_pawnhorde.js',
	},
	// ---- 4D ----
	'4x4x4x4_Chess': {
		group: '4D',
		name: '4×4×4×4 Chess',
		previewPath: '/shared/chess/preview_variants/variants/prev_4x4x4x4chess.js',
		loadPath: '/shared/chess/load_variants/variants/load_4x4x4x4chess.js',
	},
	'5D_Chess': {
		group: '4D',
		name: '5D Chess',
		previewPath: '/shared/chess/preview_variants/variants/prev_5dchess.js',
		loadPath: '/shared/chess/load_variants/variants/load_5dchess.js',
	},
	// ---- Showcase ----
	Omega: {
		group: 'showcase',
		name: 'Showcase: Omega',
		previewPath: '/shared/chess/preview_variants/variants/prev_omega.js',
	},
	Omega_Squared: {
		group: 'showcase',
		name: 'Showcase: Omega^2',
		previewPath: '/shared/chess/preview_variants/variants/prev_omegasquared.js',
		loadPath: '/shared/chess/load_variants/variants/load_omegasquared.js',
	},
	Omega_Cubed: {
		group: 'showcase',
		name: 'Showcase: Omega^3',
		previewPath: '/shared/chess/preview_variants/variants/prev_omegacubed.js',
		loadPath: '/shared/chess/load_variants/variants/load_omegacubed.js',
	},
	Omega_Fourth: {
		group: 'showcase',
		name: 'Showcase: Omega^4',
		previewPath: '/shared/chess/preview_variants/variants/prev_omegafourth.js',
		loadPath: '/shared/chess/load_variants/variants/load_omegafourth.js',
	},
} satisfies Record<string, VariantRegistryEntry>;

/** An array of all valid variant codes. */
const VARIANT_CODES = Object.keys(VARIANT_REGISTRY) as (keyof typeof VARIANT_REGISTRY)[];

// Functions ---------------------------------------------------------------------------------

/**
 * Tests if the provided variant is a valid variant.
 * Acts as a type guard, narrowing the input to {@link VariantInfo}.
 */
function isVariantValid(variant: string): variant is VariantCode {
	return variant in VARIANT_REGISTRY;
}

/** Takes a variant code and returns its English display name. */
function getVariantName(variant: VariantCode): string {
	return VARIANT_REGISTRY[variant].name;
}

// Exports ----------------------------------------------------------

export default {
	// Constants
	VARIANT_REGISTRY,
	VARIANT_CODES,
	// Functions
	isVariantValid,
	getVariantName,
};
