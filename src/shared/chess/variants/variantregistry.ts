// src/shared/chess/variants/variantregistry.ts

/**
 * Master registry of all variants.
 *
 * Stores variant's code, display name, and dynamic import functions for their scripts.
 *
 * Existing groups are: Standard, Horde, 4D, and Showcase.
 */

import type { VariantModule } from './variant_scripts/variantutil.js';

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
	/** Dynamically imports the script for this variant. */
	loadVariant: () => Promise<VariantModule>;
};

// ================================ VARIANT REGISTRY ================================

const VARIANT_REGISTRY = {
	// ---- Standard ----
	Classical: {
		group: 'standard',
		name: 'Classical',
		loadVariant: () => import('./variant_scripts/variants/var_classical.js'),
	},
	Core: {
		group: 'standard',
		name: 'Core',
		loadVariant: () => import('./variant_scripts/variants/var_core.js'),
	},
	Standarch: {
		group: 'standard',
		name: 'Standarch',
		loadVariant: () => import('./variant_scripts/variants/var_standarch.js'),
	},
	Space_Classic: {
		group: 'standard',
		name: 'Space Classic',
		loadVariant: () => import('./variant_scripts/variants/var_spaceclassic.js'),
	},
	CoaIP: {
		group: 'standard',
		name: 'Chess on an Infinite Plane',
		loadVariant: () => import('./variant_scripts/variants/var_coaip.js'),
	},
	Space: {
		group: 'standard',
		name: 'Space',
		loadVariant: () => import('./variant_scripts/variants/var_space.js'),
	},
	Obstocean: {
		group: 'standard',
		name: 'Obstocean',
		loadVariant: () => import('./variant_scripts/variants/var_obstocean.js'),
	},
	Chess: {
		group: 'standard',
		name: 'Chess',
		loadVariant: () => import('./variant_scripts/variants/var_chess.js'),
	},
	Confined_Classical: {
		group: 'standard',
		name: 'Confined Classical',
		loadVariant: () => import('./variant_scripts/variants/var_confinedclassical.js'),
	},
	Classical_Plus: {
		group: 'standard',
		name: 'Classical+',
		loadVariant: () => import('./variant_scripts/variants/var_classicalplus.js'),
	},
	Pawndard: {
		group: 'standard',
		name: 'Pawndard',
		loadVariant: () => import('./variant_scripts/variants/var_pawndard.js'),
	},
	Knightline: {
		group: 'standard',
		name: 'Knightline',
		loadVariant: () => import('./variant_scripts/variants/var_knightline.js'),
	},
	Palace: {
		group: 'standard',
		name: 'Palace',
		loadVariant: () => import('./variant_scripts/variants/var_palace.js'),
	},
	CoaIP_HO: {
		group: 'standard',
		name: 'Chess on an Infinite Plane - Huygens Option',
		loadVariant: () => import('./variant_scripts/variants/var_coaipho.js'),
	},
	CoaIP_RO: {
		group: 'standard',
		name: 'Chess on an Infinite Plane - Roses Option',
		loadVariant: () => import('./variant_scripts/variants/var_coaipro.js'),
	},
	CoaIP_NO: {
		group: 'standard',
		name: 'Chess on an Infinite Plane - Knightriders Option',
		loadVariant: () => import('./variant_scripts/variants/var_coaipno.js'),
	},
	// Deleted variants, kept to support pasting old game notation.
	Knighted_Chess: {
		group: 'standard',
		name: 'Knighted Chess',
		loadVariant: () => import('./variant_scripts/variants/var_knightedchess.js'),
	},
	Abundance: {
		group: 'standard',
		name: 'Abundance',
		loadVariant: () => import('./variant_scripts/variants/var_abundance.js'),
	},
	Amazon_Chandelier: {
		group: 'standard',
		name: 'Amazon Chandelier',
		loadVariant: () => import('./variant_scripts/variants/var_amazonchandelier.js'),
	},
	Containment: {
		group: 'standard',
		name: 'Containment',
		loadVariant: () => import('./variant_scripts/variants/var_containment.js'),
	},
	// ---- Horde ----
	Pawn_Horde: {
		group: 'horde',
		name: 'Pawn Horde',
		loadVariant: () => import('./variant_scripts/variants/var_pawnhorde.js'),
	},
	// ---- 4D ----
	'4x4x4x4_Chess': {
		group: '4D',
		name: '4×4×4×4 Chess',
		loadVariant: () => import('./variant_scripts/variants/var_4x4x4x4chess.js'),
	},
	'5D_Chess': {
		group: '4D',
		name: '5D Chess',
		loadVariant: () => import('./variant_scripts/variants/var_5dchess.js'),
	},
	// ---- Showcase ----
	Omega: {
		group: 'showcase',
		name: 'Showcase: Omega',
		loadVariant: () => import('./variant_scripts/variants/var_omega.js'),
	},
	Omega_Squared: {
		group: 'showcase',
		name: 'Showcase: Omega^2',
		loadVariant: () => import('./variant_scripts/variants/var_omegasquared.js'),
	},
	Omega_Cubed: {
		group: 'showcase',
		name: 'Showcase: Omega^3',
		loadVariant: () => import('./variant_scripts/variants/var_omegacubed.js'),
	},
	Omega_Fourth: {
		group: 'showcase',
		name: 'Showcase: Omega^4',
		loadVariant: () => import('./variant_scripts/variants/var_omegafourth.js'),
	},
} satisfies Record<string, VariantRegistryEntry>;

/** An array of all valid variant codes. */
const VARIANT_CODES = Object.keys(VARIANT_REGISTRY) as (keyof typeof VARIANT_REGISTRY)[];

// Functions ------------------------------------------------------------------

/**
 * Resolves a variant string (English name or code) sourced from metadata into a {@link VariantCode}.
 * Warns if the variant is not recognized.
 */
function resolveVariantCode(variantName: string | undefined): VariantCode | undefined {
	if (variantName === undefined) return undefined;
	// Direct code match
	if (variantName in VARIANT_REGISTRY) return variantName as VariantCode;
	// Search by English display name
	for (const [code, variantEntry] of Object.entries(VARIANT_REGISTRY) as [
		VariantCode,
		VariantRegistryEntry,
	][]) {
		if (variantEntry.name === variantName) return code;
	}
	console.warn(`Variant "${variantName}" is not recognized.`);
	return undefined;
}

/** Returns the English display name of the given variant code. */
function getVariantName(variantCode: VariantCode): string {
	return VARIANT_REGISTRY[variantCode].name;
}

/**
 * Tests if the provided variant is a valid variant.
 * Acts as a type guard, narrowing the input to {@link VariantCode}.
 */
function isVariantValid(variant: string): variant is VariantCode {
	return variant in VARIANT_REGISTRY;
}

/** Returns the dynamic import function for the given variant code. */
function getVariantLoader(variantCode: VariantCode): () => Promise<VariantModule> {
	return VARIANT_REGISTRY[variantCode].loadVariant;
}

// Exports ----------------------------------------------------------

export default {
	// Constants
	VARIANT_CODES,
	// Functions
	resolveVariantCode,
	getVariantName,
	isVariantValid,
	getVariantLoader,
};
