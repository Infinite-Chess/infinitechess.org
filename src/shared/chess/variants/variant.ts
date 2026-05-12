// src/shared/chess/variants/variant.ts

/**
 * This script contains methods for retrieving the game rules, or movesets of any given variant.
 */

import type { BaseRay } from '../../util/math/geometry.js';
import type { GameRules } from '../util/gamerules.js';
import type { LoadModule } from '../load_variants/loadutil.js';
import type { CoordsKey, Coords } from '../util/coordutil.js';
import type { GameruleWinCondition } from '../util/winconutil.js';
import type { Movesets, PieceMoveset } from '../logic/movesets.js';
import type { VariantCode, VariantRegistryEntry } from './variantregistry.js';
import type { RawType, RawTypeGroup, PlayerGroup } from '../util/typeutil.js';
import type { SpecialMoveFunction, SpecialVicinity } from '../logic/specialmove.js';
import type { PreviewModule, GameRuleModifications } from '../preview_variants/previewutil.js';

import jsutil from '../../util/jsutil.js';
import movesets from '../logic/movesets.js';
import specialmove from '../logic/specialmove.js';
import icnconverter from '../logic/icn/icnconverter.js';
import variantregistry from './variantregistry.js';
import { players as p } from '../util/typeutil.js';
import { DEFAULT_PROMOTIONS } from '../preview_variants/defaultPromotions.js';

// Constants -------------------------------------------------------------------------------

const defaultWinConditions: PlayerGroup<GameruleWinCondition[]> = {
	[p.WHITE]: ['checkmate'],
	[p.BLACK]: ['checkmate'],
};
const defaultTurnOrder = [p.WHITE, p.BLACK];

// Module caches -------------------------------------------------------------------------------

const previewModuleCache = new Map<VariantCode, PreviewModule>();
const loadModuleCache = new Map<VariantCode, LoadModule>();

/**
 * Ensures the preview and load module for the given variant are cached.
 * Only returns a `Promise<void>` when the modules must be dynamically imported,
 * otherwise this is synchronious.
 */
function ensureVariantLoaded(variantCode: VariantCode): void | Promise<void> {
	if (previewModuleCache.has(variantCode)) return; // Already loaded — synchronous fast path
	const entry = variantregistry.VARIANT_REGISTRY[variantCode] as VariantRegistryEntry;
	return Promise.all([
		entry.loadPreview(),
		entry.loadModule ? entry.loadModule() : Promise.resolve(undefined),
	]).then(([previewMod, loadMod]) => {
		console.log(`Variant "${entry.name}" loaded!`);
		previewModuleCache.set(variantCode, previewMod);
		if (loadMod !== undefined) loadModuleCache.set(variantCode, loadMod);
	});
}

/** Loads all variant modules. Call once at startup on the server. */
async function loadAllVariants(): Promise<void> {
	await Promise.all(variantregistry.VARIANT_CODES.map((code) => ensureVariantLoaded(code)));
	console.log('-- All variants loaded! --');
}

/** Guards against accessing a variant that hasn't been loaded yet. */
function getPreviewModule(code: VariantCode): PreviewModule {
	const mod = previewModuleCache.get(code);
	if (!mod) throw new Error(`Variant "${code}" not loaded. Call ensureVariantLoaded() first.`);
	return mod;
}

function getLoadModule(code: VariantCode): LoadModule | undefined {
	return loadModuleCache.get(code);
}

// Functions ---------------------------------------------------------------------------------

/**
 * Resolves a variant string (English name or code) sourced from metadata into a {@link VariantCode}.
 * Warns if the variant is not recognized.
 * @param variantName - The variant string from metadata (may be an English name, code, or undefined).
 * @returns The corresponding {@link VariantCode}, or `null` if the input is not recognized.
 */
function resolveVariantCode(variantName: string | undefined): VariantCode | null {
	if (variantName === undefined) return null;
	// Direct code match
	if (variantName in variantregistry.VARIANT_REGISTRY) return variantName as VariantCode;
	// Search by English display name
	for (const [code, variantEntry] of Object.entries(variantregistry.VARIANT_REGISTRY) as [
		VariantCode,
		VariantRegistryEntry,
	][]) {
		if (variantEntry.name === variantName) return code;
	}
	console.warn(`Variant "${variantName}" is not recognized. Treating as no variant.`);
	return null;
}

/**
 * Resolves the variant from the metadata, normalizes the metadata's `Variant` property to the
 * English display name (if recognized), or deletes it (if not recognized), then returns the
 * resolved {@link VariantCode}.
 * @param metadata - The metadata of the game with the optional `Variant` property. MUST BE A DIRECT REFERENCE (not a copy)
 * @returns The resolved {@link VariantCode}, or `null` if no valid variant was found.
 */
function resolveAndNormalizeVariantFromMetadata(metadata: {
	Variant?: string;
}): VariantCode | null {
	if (!metadata.Variant) return null;
	const resolved = resolveVariantCode(metadata.Variant);
	if (resolved !== null) {
		// Normalize to English display name
		metadata.Variant = getVariantName(resolved);
	} else {
		// Unrecognized Variant: Treat as if no variant was specified
		delete metadata.Variant;
	}
	return resolved;
}

/**
 * Given the variant code and timestamp, calculates the starting position and specialRights.
 * @param variantCode - The variant code.
 * @param timestamp - The game's start timestamp in ms since epoch.
 * @returns An object containing 2 properties: `position`, and `specialRights`.
 */
function getStartingPositionOfVariant(
	variantCode: VariantCode,
	timestamp: number,
): {
	position: Map<CoordsKey, number>;
	specialRights: Set<CoordsKey>;
} {
	// eslint-disable-next-line prefer-const
	let { position, specialRights } = getPreviewModule(variantCode).getPosition(timestamp);

	const loadMod = getLoadModule(variantCode);
	if (loadMod?.getGeneratorRules) {
		// Generator-based: derive specialRights from the load module's rules
		const rules = loadMod.getGeneratorRules();
		specialRights = icnconverter.generateSpecialRights(
			position,
			rules.pawnDoublePush,
			rules.castleWith,
		);
		return { position, specialRights };
	} else {
		// String-based: specialRights were parsed from the position string
		return {
			position: position,
			specialRights: specialRights!, // Always available for string-based variants,
		};
	}
}

/**
 * Returns the variant's gamerules at the provided timestamp.
 * @param variantCode - The variant code.
 * @param timestamp - The game's start timestamp in ms since epoch.
 * @returns The gamerules object for the variant.
 */
function getGameRulesOfVariant(variantCode: VariantCode, timestamp: number): GameRules {
	const gameruleModifications: GameRuleModifications = jsutil.deepCopyObject(
		getVariantGameRuleModifications(variantCode, timestamp),
	);

	return getGameRules(gameruleModifications);
}

/** Returns the gamerule modifications for the given variant at the given timestamp. */
function getVariantGameRuleModifications(
	variantCode: VariantCode,
	timestamp: number,
): GameRuleModifications {
	return getPreviewModule(variantCode).gameruleModifications?.(timestamp) ?? {};
}

/**
 * Returns default gamerules with provided modifications
 * @param modifications - The modifications to the default gamerules.
 * @returns The gamerules
 */
function getGameRules(modifications: GameRuleModifications = {}): GameRules {
	// { slideLimit, promotionRanks, position }
	const gameRules: GameRules = {
		// REQUIRED gamerules
		winConditions: modifications.winConditions || jsutil.deepCopyObject(defaultWinConditions),
		turnOrder: modifications.turnOrder || jsutil.deepCopyObject(defaultTurnOrder),
	};

	// GameRules that have a dedicated ICN spot...
	if (modifications.promotionsAllowed !== null) {
		gameRules.promotionRanks = modifications.promotionRanks || {
			[p.WHITE]: [8n],
			[p.BLACK]: [1n],
		};
		gameRules.promotionsAllowed = modifications.promotionsAllowed ?? DEFAULT_PROMOTIONS;
	}
	if (modifications.moveRule !== null) gameRules.moveRule = modifications.moveRule || 100;

	return jsutil.deepCopyObject(gameRules); // Copy it so the game doesn't modify the values in this module.
}

/**
 * Returns the bare-minimum gamerules a game needs to function.
 * @returns {GameRules} The gameRules object
 */
function getBareMinimumGameRules(): GameRules {
	return getGameRules({ promotionsAllowed: null, moveRule: null }); // Erase the defaults to end up with only the required's
}

/**
 * Gets the piece movesets for the given variant and timestamp.
 * @param variantCode - The variant code, or null for pasted games with no variant specified.
 * @param timestamp - The game's start timestamp in ms since epoch.
 * @param slideLimit - If provided, overrides the slideLimit gamerule of the variant. Only meaningful for variants without a movesetGenerator (i.e. those that use default movesets), because custom movesets define their own slide ranges explicitly and don't inherit a global slide limit.
 * @returns The pieceMovesets property of the gamefile.
 */
function getMovesetsOfVariant(
	variantCode: VariantCode | null,
	slideLimit?: bigint,
): RawTypeGroup<() => PieceMoveset> {
	// Pasted games with no variant specified use the default movesets
	if (variantCode === null) return getMovesets(undefined, slideLimit);

	const loadMod = getLoadModule(variantCode);

	if (loadMod?.genMovesetModifications) {
		const movesetModifications = loadMod.genMovesetModifications();
		return getMovesets(movesetModifications, slideLimit);
	} else {
		// No custom moveset generator, so just get the default movesets
		return getMovesets(undefined, slideLimit);
	}
}

/**
 * Returns default movesets with provided modifications such that each piece contains a function returning a copy of its moveset (to avoid modifying originals).
 * Any piece type present in the modifications will replace the default move that for that piece.
 * The slidelimit gamerule will only be applied to default movesets, not modified ones.
 * @param movesetModifications - The modifications to the default movesets.
 * @param [defaultSlideLimitForOldVariants] Optional. The slidelimit to use for default movesets, if applicable.
 * @returns The pieceMovesets property of the gamefile.
 */
function getMovesets(
	movesetModifications: Movesets = {},
	defaultSlideLimitForOldVariants?: bigint,
): RawTypeGroup<() => PieceMoveset> {
	const origMoveset = movesets.getPieceDefaultMovesets(defaultSlideLimitForOldVariants);
	// The running piece movesets property of the gamefile.
	const pieceMovesets: RawTypeGroup<() => PieceMoveset> = {};

	for (const [piece, moves] of Object.entries(origMoveset)) {
		const intPiece = Number(piece) as RawType;
		pieceMovesets[intPiece] = movesetModifications[intPiece]
			? (): PieceMoveset => jsutil.deepCopyObject(movesetModifications[intPiece]!)
			: (): PieceMoveset => jsutil.deepCopyObject(moves);
	}

	return pieceMovesets;
}

/** Returns the special moves for the given variant at the specified timestamp. */
function getSpecialMovesOfVariant(
	variantCode: VariantCode | null,
): RawTypeGroup<SpecialMoveFunction> {
	const defaultSpecialMoves = jsutil.deepCopyObject(specialmove.defaultSpecialMoves);
	// Pasted games with no variant specified use the default
	if (variantCode === null) return defaultSpecialMoves;

	const overrides = getLoadModule(variantCode)?.getSpecialMoves?.();
	if (overrides === undefined) return defaultSpecialMoves;
	jsutil.copyPropertiesToObject(overrides, defaultSpecialMoves);
	return defaultSpecialMoves;
}
/** Returns the special vicinity for the given variant at the specified timestamp. */
function getSpecialVicinityOfVariant(variantCode: VariantCode | null): SpecialVicinity {
	const defaultSpecialVicinityByPiece = specialmove.getDefaultSpecialVicinitiesByPiece();
	// Pasted games with no variant specified use the default
	if (variantCode === null) return defaultSpecialVicinityByPiece;

	const overrides = getLoadModule(variantCode)?.getSpecialVicinity?.();
	if (overrides === undefined) return defaultSpecialVicinityByPiece;
	jsutil.copyPropertiesToObject(overrides, defaultSpecialVicinityByPiece);
	return defaultSpecialVicinityByPiece;
}

/** Returns the preset square annotations for the given variant, if they have any. */
function getSquarePresets(variantCode: VariantCode | null): Coords[] {
	if (variantCode === null) return [];
	const squarePresets = getLoadModule(variantCode)?.getAnnotePresets?.()?.squares;
	return squarePresets ? icnconverter.parsePresetSquares(squarePresets) : [];
}

/** Returns the preset ray annotations for the given variant, if they have any. */
function getRayPresets(variantCode: VariantCode | null): BaseRay[] {
	if (variantCode === null) return [];
	const rayPresets = getLoadModule(variantCode)?.getAnnotePresets?.()?.rays;
	return rayPresets ? icnconverter.parsePresetRays(rayPresets) : [];
}

/** Returns the worldBorder property for the given variant, if they have one. */
function getVariantWorldBorder(variantCode: VariantCode | null): bigint | undefined {
	if (variantCode === null) return undefined;
	return getPreviewModule(variantCode).worldBorderDist;
}

/**
 * Returns the length of the position string for the given variant at the specified timestamp,
 * or `undefined` if the variant uses a generator (no fixed position string).
 * @param variantCode - The variant code.
 * @param timestamp - The game's start timestamp in ms since epoch.
 */
function getVariantPositionStringLength(
	variantCode: VariantCode,
	timestamp: number,
): number | undefined {
	return getPreviewModule(variantCode).getPositionStringLength?.(timestamp);
}

/** Returns the English display name of the given variant, as stored in the variant dictionary. */
function getVariantName(variantCode: VariantCode): string {
	return variantregistry.VARIANT_REGISTRY[variantCode].name;
}

/**
 * Tests if the provided variant is a valid variant.
 * Acts as a type guard, narrowing the input to {@link VariantInfo}.
 */
function isVariantValid(variant: string): variant is VariantCode {
	return variant in variantregistry.VARIANT_REGISTRY;
}

// Exports ------------------------------------------------------------------

export default {
	resolveVariantCode,
	resolveAndNormalizeVariantFromMetadata,
	ensureVariantLoaded,
	loadAllVariants,
	getStartingPositionOfVariant,
	getGameRulesOfVariant,
	getMovesetsOfVariant,
	getSpecialMovesOfVariant,
	getSpecialVicinityOfVariant,
	getBareMinimumGameRules,
	getSquarePresets,
	getRayPresets,
	getVariantWorldBorder,
	getVariantPositionStringLength,
	getVariantName,
	isVariantValid,
};
