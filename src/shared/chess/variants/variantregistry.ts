// src/shared/chess/variants/variantregistry.ts

/**
 * Master registry of all variants.
 *
 * Stores variant's code, display name, and dynamic import functions for their preview and load scripts.
 *
 * Existing groups are: Standard, Horde, 4D, and Showcase.
 */

import type { LoadModule } from '../load_variants/loadutil.js';
import type { PreviewModule } from '../preview_variants/previewutil.js';

// Types -------------------------------------------------------------------------------

/** All valid variant group names. */
export type VariantGroup = 'standard' | 'horde' | '4D' | 'showcase' | 'custom';

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
	/** Dynamically imports the preview script for this variant. */
	loadPreview: () => Promise<PreviewModule>;
	/**
	 * Dynamically imports the load script for this variant.
	 * Only present for variants with non-default movesets, special moves,
	 * special vicinity, or preset annotations.
	 */
	loadModule?: () => Promise<LoadModule>;
};

// ====================================== VARIANT REGISTRY ======================================

const VARIANT_REGISTRY = {
	// ---- Standard ----
	Classical: {
		group: 'standard',
		name: 'Classical',
		loadPreview: () => import('../preview_variants/variants/prev_classical.js'),
	},
	Core: {
		group: 'standard',
		name: 'Core',
		loadPreview: () => import('../preview_variants/variants/prev_core.js'),
	},
	Standarch: {
		group: 'standard',
		name: 'Standarch',
		loadPreview: () => import('../preview_variants/variants/prev_standarch.js'),
	},
	Space_Classic: {
		group: 'standard',
		name: 'Space Classic',
		loadPreview: () => import('../preview_variants/variants/prev_spaceclassic.js'),
	},
	CoaIP: {
		group: 'standard',
		name: 'Chess on an Infinite Plane',
		loadPreview: () => import('../preview_variants/variants/prev_coaip.js'),
	},
	Space: {
		group: 'standard',
		name: 'Space',
		loadPreview: () => import('../preview_variants/variants/prev_space.js'),
	},
	Obstocean: {
		group: 'standard',
		name: 'Obstocean',
		loadPreview: () => import('../preview_variants/variants/prev_obstocean.js'),
	},
	Chess: {
		group: 'standard',
		name: 'Chess',
		loadPreview: () => import('../preview_variants/variants/prev_chess.js'),
	},
	Confined_Classical: {
		group: 'standard',
		name: 'Confined Classical',
		loadPreview: () => import('../preview_variants/variants/prev_confinedclassical.js'),
	},
	Classical_Plus: {
		group: 'standard',
		name: 'Classical+',
		loadPreview: () => import('../preview_variants/variants/prev_classicalplus.js'),
	},
	Pawndard: {
		group: 'standard',
		name: 'Pawndard',
		loadPreview: () => import('../preview_variants/variants/prev_pawndard.js'),
	},
	Knightline: {
		group: 'standard',
		name: 'Knightline',
		loadPreview: () => import('../preview_variants/variants/prev_knightline.js'),
	},
	Palace: {
		group: 'standard',
		name: 'Palace',
		loadPreview: () => import('../preview_variants/variants/prev_palace.js'),
	},
	CoaIP_HO: {
		group: 'standard',
		name: 'Chess on an Infinite Plane - Huygens Option',
		loadPreview: () => import('../preview_variants/variants/prev_coaipho.js'),
	},
	CoaIP_RO: {
		group: 'standard',
		name: 'Chess on an Infinite Plane - Roses Option',
		loadPreview: () => import('../preview_variants/variants/prev_coaipro.js'),
	},
	CoaIP_NO: {
		group: 'standard',
		name: 'Chess on an Infinite Plane - Knightriders Option',
		loadPreview: () => import('../preview_variants/variants/prev_coaipno.js'),
	},
	// Deleted variants, kept to support pasting old game notation.
	Knighted_Chess: {
		group: 'standard',
		name: 'Knighted Chess',
		loadPreview: () => import('../preview_variants/variants/prev_knightedchess.js'),
	},
	Abundance: {
		group: 'standard',
		name: 'Abundance',
		loadPreview: () => import('../preview_variants/variants/prev_abundance.js'),
	},
	Amazon_Chandelier: {
		group: 'standard',
		name: 'Amazon Chandelier',
		loadPreview: () => import('../preview_variants/variants/prev_amazonchandelier.js'),
	},
	Containment: {
		group: 'standard',
		name: 'Containment',
		loadPreview: () => import('../preview_variants/variants/prev_containment.js'),
	},
	// ---- Horde ----
	Pawn_Horde: {
		group: 'horde',
		name: 'Pawn Horde',
		loadPreview: () => import('../preview_variants/variants/prev_pawnhorde.js'),
	},
	// ---- 4D ----
	'4x4x4x4_Chess': {
		group: '4D',
		name: '4×4×4×4 Chess',
		loadPreview: () => import('../preview_variants/variants/prev_4x4x4x4chess.js'),
		loadModule: () => import('../load_variants/variants/load_4x4x4x4chess.js'),
	},
	'5D_Chess': {
		group: '4D',
		name: '5D Chess',
		loadPreview: () => import('../preview_variants/variants/prev_5dchess.js'),
		loadModule: () => import('../load_variants/variants/load_5dchess.js'),
	},
	// ---- Showcase ----
	Omega: {
		group: 'showcase',
		name: 'Showcase: Omega',
		loadPreview: () => import('../preview_variants/variants/prev_omega.js'),
	},
	Omega_Squared: {
		group: 'showcase',
		name: 'Showcase: Omega^2',
		loadPreview: () => import('../preview_variants/variants/prev_omegasquared.js'),
		loadModule: () => import('../load_variants/variants/load_omegasquared.js'),
	},
	Omega_Cubed: {
		group: 'showcase',
		name: 'Showcase: Omega^3',
		loadPreview: () => import('../preview_variants/variants/prev_omegacubed.js'),
		loadModule: () => import('../load_variants/variants/load_omegacubed.js'),
	},
	Omega_Fourth: {
		group: 'showcase',
		name: 'Showcase: Omega^4',
		loadPreview: () => import('../preview_variants/variants/prev_omegafourth.js'),
		loadModule: () => import('../load_variants/variants/load_omegafourth.js'),
	},
} satisfies Record<string, VariantRegistryEntry>;

/** An array of all valid variant codes. */
const VARIANT_CODES = Object.keys(VARIANT_REGISTRY) as (keyof typeof VARIANT_REGISTRY)[];

// Exports ----------------------------------------------------------

export default {
	// Constants
	VARIANT_REGISTRY,
	VARIANT_CODES,
};
