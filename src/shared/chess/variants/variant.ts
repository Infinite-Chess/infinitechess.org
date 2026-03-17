// src/shared/chess/variants/variant.ts

/**
 * This script contains methods for retrieving the game rules, or movesets of any given variant.
 */

import type { BaseRay } from '../../util/math/geometry.js';
import type { GameRules } from '../util/gamerules.js';
import type { CoordsKey, Coords } from '../util/coordutil.js';
import type { GameruleWinCondition } from '../util/winconutil.js';
import type { Movesets, PieceMoveset } from '../logic/movesets.js';
import type { RawType, RawTypeGroup, PlayerGroup } from '../util/typeutil.js';
import type { SpecialMoveFunction, SpecialVicinity } from '../logic/specialmove.js';
import type {
	VariantCode,
	GameRuleModifications,
	TimeVariantProperty,
	Variant,
} from './variantdictionary.js';

import jsutil from '../../util/jsutil.js';
import movesets from '../logic/movesets.js';
import specialmove from '../logic/specialmove.js';
import icnconverter from '../logic/icn/icnconverter.js';
import { players as p } from '../util/typeutil.js';
import variantDictionary from './variantdictionary.js';

// Constants -------------------------------------------------------------------------------

const defaultWinConditions: PlayerGroup<GameruleWinCondition[]> = {
	[p.WHITE]: ['checkmate'],
	[p.BLACK]: ['checkmate'],
};
const defaultTurnOrder = [p.WHITE, p.BLACK];

/** Tuple of all valid variant code strings, for use in runtime validation (e.g. Zod schemas). */
export const variantCodes = Object.keys(variantDictionary) as VariantCode[];

// Functions ---------------------------------------------------------------------------------

/**
 * Tests if the provided variant is a valid variant.
 * Acts as a type guard, narrowing the input to {@link VariantCode}.
 * @param variantName - The name of the variant
 * @returns Whether the variant is a valid variant
 */
function isVariantValid(variantName: string | undefined): variantName is VariantCode {
	if (variantName === undefined) return false;
	return variantName in variantDictionary;
}

/**
 * Resolves a variant string (English name or code) sourced from metadata into a {@link VariantCode}.
 * Warns if the variant is not recognized.
 * @param variantName - The variant string from metadata (may be an English name, code, or undefined).
 * @returns The corresponding {@link VariantCode}, or `null` if the input is not recognized.
 */
function resolveVariantCode(variantName: string | undefined): VariantCode | null {
	if (variantName === undefined) return null;
	// Direct code match
	if (variantName in variantDictionary) return variantName as VariantCode;
	// Search by English display name
	for (const [code, variantEntry] of Object.entries(variantDictionary) as [
		VariantCode,
		Variant,
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
function resolveAndNormalizeVariantInMetadata(metadata: { Variant?: string }): VariantCode | null {
	if (!metadata.Variant) return null;
	const resolved = resolveVariantCode(metadata.Variant);
	if (resolved !== null) {
		// Normalize to English display name
		metadata.Variant = variantDictionary[resolved].name;
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
	const variantEntry = variantDictionary[variantCode];

	let positionString: string;
	let position: Map<CoordsKey, number>;

	// Does the entry have a `positionString` property, or a `generator` property?
	if (variantEntry.positionString !== undefined) {
		positionString = getApplicableTimestampEntry(variantEntry.positionString, timestamp);
		return icnconverter.generatePositionFromShortForm(positionString);
	} else {
		// Generate the starting position
		position = variantEntry.generator.algorithm();
		const specialRights = icnconverter.generateSpecialRights(
			position,
			variantEntry.generator.rules.pawnDoublePush,
			variantEntry.generator.rules.castleWith,
		);
		return { position, specialRights };
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
	const variantEntry = variantDictionary[variantCode];

	// Does the gameruleModifications entry have multiple UTC timestamps? Or just one?

	return getApplicableTimestampEntry(variantEntry.gameruleModifications, timestamp);
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
	if (modifications.promotionRanks !== null) {
		// Either undefined (use default), or custom
		gameRules.promotionRanks = modifications.promotionRanks || {
			[p.WHITE]: [8n],
			[p.BLACK]: [1n],
		};
		if (!modifications.promotionsAllowed)
			throw new Error(
				'When overriding promotionRanks, you must also override promotionsAllowed!',
			);
		gameRules.promotionsAllowed = modifications.promotionsAllowed;
	}
	if (modifications.moveRule !== null) gameRules.moveRule = modifications.moveRule || 100;

	// GameRules that DON'T have a dedicated ICN spot...
	if (modifications.slideLimit !== undefined) gameRules.slideLimit = modifications.slideLimit;

	return jsutil.deepCopyObject(gameRules) as GameRules; // Copy it so the game doesn't modify the values in this module.
}

/**
 * Returns the bare-minimum gamerules a game needs to function.
 * @returns {GameRules} The gameRules object
 */
function getBareMinimumGameRules(): GameRules {
	return getGameRules({ promotionRanks: null, moveRule: null }); // Erase the defaults to end up with only the required's
}

/**
 * Accepts a time-variant property and a timestamp, returns the value that should be used for that point in time.
 * @param object - A time-variant property (positionString, gameruleModifications, etc.)
 * @param timestamp - The timestamp in ms since epoch to select the appropriate value.
 */
function getApplicableTimestampEntry<Inner>(
	object: TimeVariantProperty<Inner>,
	timestamp: number,
): Inner {
	// Each of these checks are needed to determine whether ANY TimeVariantProperty has timestamp entries
	if (typeof object !== 'object' || object === null || !object.hasOwnProperty(0)) {
		return object as Inner;
	}

	let timeStampKeys = Object.keys(object as Object);

	timeStampKeys = timeStampKeys.sort().reverse(); // [1709017200000, 0]
	let timestampToUse: number;
	for (const ts of timeStampKeys) {
		const thisTimestamp = Number.parseInt(ts);
		if (thisTimestamp <= timestamp) {
			timestampToUse = thisTimestamp;
			break;
		}
	}
	return (object as { [timestamp: number]: Inner })[timestampToUse!]!;
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
	timestamp: number,
	slideLimit?: bigint,
): RawTypeGroup<() => PieceMoveset> {
	// Pasted games with no variant specified use the default movesets
	if (variantCode === null) return getMovesets(undefined, slideLimit);
	const variantEntry = variantDictionary[variantCode];

	let movesetModifications: Movesets;

	if (!variantEntry.movesetGenerator) {
		movesetModifications = {};
		slideLimit =
			slideLimit ??
			getApplicableTimestampEntry(variantEntry.gameruleModifications, timestamp).slideLimit;
	} else {
		movesetModifications = getApplicableTimestampEntry(
			variantEntry.movesetGenerator,
			timestamp,
		)();
	}

	return getMovesets(movesetModifications, slideLimit);
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
	timestamp: number,
): RawTypeGroup<SpecialMoveFunction> {
	const defaultSpecialMoves = jsutil.deepCopyObject(specialmove.defaultSpecialMoves);
	// Pasted games with no variant specified use the default
	if (variantCode === null) return defaultSpecialMoves;
	const variantEntry = variantDictionary[variantCode];

	if (variantEntry.specialMoves === undefined) return defaultSpecialMoves;

	const overrides = getApplicableTimestampEntry(variantEntry.specialMoves, timestamp);
	jsutil.copyPropertiesToObject(overrides, defaultSpecialMoves);
	return defaultSpecialMoves;
}

/** Returns the special vicinity for the given variant at the specified timestamp. */
function getSpecialVicinityOfVariant(
	variantCode: VariantCode | null,
	timestamp: number,
): SpecialVicinity {
	const defaultSpecialVicinityByPiece = specialmove.getDefaultSpecialVicinitiesByPiece();
	// Pasted games with no variant specified use the default
	if (variantCode === null) return defaultSpecialVicinityByPiece;
	const variantEntry = variantDictionary[variantCode];

	if (variantEntry.specialVicinity === undefined) return defaultSpecialVicinityByPiece;

	const overrides = getApplicableTimestampEntry(variantEntry.specialVicinity, timestamp);
	jsutil.copyPropertiesToObject(overrides, defaultSpecialVicinityByPiece);
	return defaultSpecialVicinityByPiece;
}

/** Returns the preset square annotations for the given variant, if they have any. */
function getSquarePresets(variantCode: VariantCode | null): Coords[] {
	if (variantCode === null) return [];
	const square_presets = variantDictionary[variantCode].annotePresets?.squares;
	return square_presets ? icnconverter.parsePresetSquares(square_presets) : [];
}

/** Returns the preset ray annotations for the given variant, if they have any. */
function getRayPresets(variantCode: VariantCode | null): BaseRay[] {
	if (variantCode === null) return [];
	const ray_presets = variantDictionary[variantCode].annotePresets?.rays;
	return ray_presets ? icnconverter.parsePresetRays(ray_presets) : [];
}

/** Returns the worldBorder property for the given variant, if they have one. */
function getVariantWorldBorder(variantCode: VariantCode | null): bigint | undefined {
	if (variantCode === null) return undefined;
	return variantDictionary[variantCode].worldBorderDist;
}

/**
 * Returns the position string for the given variant at the specified timestamp,
 * or `undefined` if the variant uses a generator (no fixed position string).
 * @param variantCode - The variant code.
 * @param timestamp - The game's start timestamp in ms since epoch.
 */
function getVariantPositionString(variantCode: VariantCode, timestamp: number): string | undefined {
	const variantEntry = variantDictionary[variantCode];

	if (!variantEntry.positionString) return undefined; // Generator-based variant

	// Multiple position strings for different timestamps
	return getApplicableTimestampEntry(variantEntry.positionString, timestamp);
}

/** Returns the English display name of the given variant, as stored in the variant dictionary. */
function getVariantName(variantCode: VariantCode): string {
	return variantDictionary[variantCode].name;
}

// Exports ------------------------------------------------------------------

export default {
	isVariantValid,
	resolveVariantCode,
	resolveAndNormalizeVariantInMetadata,
	getStartingPositionOfVariant,
	getGameRulesOfVariant,
	getMovesetsOfVariant,
	getSpecialMovesOfVariant,
	getSpecialVicinityOfVariant,
	getBareMinimumGameRules,
	getSquarePresets,
	getRayPresets,
	getVariantWorldBorder,
	getVariantPositionString,
	getVariantName,
};
