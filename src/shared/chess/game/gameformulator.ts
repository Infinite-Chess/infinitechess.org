// src/shared/chess/game/gameformulator.ts

/**
 * The single path from a parsed ICN (longformat) to a constructed gamefile,
 * used by both ends — the client to load a game, the server to inspect one.
 */

import type { CoordsKey } from '../../util/coordutil.js';
import type { GameConclusion } from '../util/winconutil.js';
import type { ClockValues, TimeControl } from '../util/clockutil.js';
import type { LongFormatOut, PresetAnnotes } from '../logic/icn/icnconverter.js';
import type {
	Additional,
	DatedVariant,
	GameFile,
	LoadedVariant,
	VariantOptions,
} from '../logic/gamefile.js';

import gamefile from '../logic/gamefile.js';
import icnimport from '../logic/icn/icnimport.js';
import metadatautil from '../util/metadatautil.js';
import variantcache from '../variants/variantcache.js';
import variantregistry from '../variants/variantregistry.js';

// Types -----------------------------------------------------------------------

/** Everything a gamefile is constructed from. */
export interface GameConstructionOptions {
	/** The time control of the game (e.g. `"600+5"`, or `"-"` for untimed). */
	timeControl: TimeControl;
	/** The variant, at the revision of it that applies. Pass undefined for custom/unknown positions. */
	variant: DatedVariant | undefined;
	/** The game's start timestamp in milliseconds since epoch. */
	dateTimestamp: number;
	/** Preset ray overrides for the variant's rays. */
	presetAnnotes?: PresetAnnotes;
	additional?: Additional;
}

/**
 * {@link GameConstructionOptions} carrying an explicit position — what parsing an ICN
 * always yields, since every ICN resolves to one (an empty position if it declares none).
 */
interface PositionedConstructionOptions extends GameConstructionOptions {
	additional: Additional & { variantOptions: VariantOptions };
}

/** Caller-supplied {@link Additional} fields, layered onto what the source itself resolves to. */
interface ConstructionOverrides {
	/** See {@link Additional.gameConclusion}. */
	gameConclusion?: GameConclusion;
	/** See {@link Additional.slideLimit}. */
	slideLimit?: bigint;
	/** See {@link Additional.clockValues}. */
	clockValues?: ClockValues;
}

// Functions -------------------------------------------------------------------

/**
 * Constructs the gamefile a parsed ICN describes, sourcing the position
 * from the Variant metadata whenever the ICN omits an explicit one.
 * @param validateMoves - Throws an IllegalMoveError if any move played is illegal.
 * @throws Any other error if the game couldn't be constructed at all.
 */
async function formulateGame(
	longFormat: LongFormatOut,
	overrides?: ConstructionOverrides,
	validateMoves?: true,
): Promise<GameFile> {
	const constructionOptions = await resolveConstructionOptions(longFormat, overrides);
	return constructGame(constructionOptions, validateMoves);
}

/**
 * {@link formulateGame}, reporting construction failure instead of throwing. Failure is nearly always
 * a move that would crash the game — a missing piece on its start square, or promoting to a piece no
 * space was allocated for. An illegal-but-buildable position still returns a gamefile.
 * @param revealErrors - Whether the caller surfaces the failure to the user. Affects
 *   whether we console error here the internal error.
 * @returns The constructed gamefile, or `'moves_invalid'` if construction threw.
 */
async function tryFormulateGame(
	longFormat: LongFormatOut,
	revealErrors: boolean,
	overrides?: ConstructionOverrides,
): Promise<GameFile | 'moves_invalid'> {
	try {
		return await formulateGame(longFormat, overrides);
	} catch (e: unknown) {
		if (revealErrors)
			console.error("Pasted ICN's moves are invalid:", e instanceof Error ? e.message : e);
		return 'moves_invalid';
	}
}

/**
 * Constructs the gamefile of a moveless position, purely so callers can
 * inspect the game it produces (its computed conclusion, its engine support).
 * @param variant - The variant the position is of, when one is known — supplying its
 *   movesets, so the inspection sees how the pieces truly move. REQUIRES its module preloaded.
 */
function constructPosition(variantOptions: VariantOptions, variant?: DatedVariant): GameFile {
	return constructGame({
		timeControl: '-',
		variant,
		dateTimestamp: Date.now(),
		additional: { variantOptions },
	});
}

/**
 * Resolves a parsed ICN into everything its gamefile is constructed from:
 * the variant, the timestamps, and the position + moves as gamefile options.
 *
 * Loads the resolved variant module first, since the position is read off it whenever
 * the ICN omits an explicit one (e.g. server-stored games carrying only Variant + moves).
 * An ICN with neither resolves to an empty position, left for position validation to reject.
 * That fallback is the sole reason this is async — see {@link constructionOptionsFromLongFormat}.
 */
async function resolveConstructionOptions(
	longFormat: LongFormatOut,
	overrides?: ConstructionOverrides,
): Promise<GameConstructionOptions> {
	const variant = await loadVariantOfLongFormat(longFormat);

	const positionSource = icnimport.getPositionAndSpecialRightsFromLongFormat(longFormat, variant);
	return constructionOptionsFromLongFormat(longFormat, overrides, positionSource);
}

/**
 * Loads the module of the variant an ICN declares, so the position can be read off
 * it when the ICN carries none. Undefined if the ICN names no recognized variant.
 */
async function loadVariantOfLongFormat(
	longFormat: LongFormatOut,
): Promise<LoadedVariant | undefined> {
	const code = variantregistry.resolveVariantCode(longFormat.metadata.Variant);
	if (code === undefined) return undefined;
	await variantcache.ensureVariantLoaded(code);
	const dateTimestamp = metadatautil.resolveTimestampFromMetadata(longFormat.metadata.UTCDate, longFormat.metadata.UTCTime); // prettier-ignore
	return { code, dateTimestamp, mod: variantcache.getModule(code) };
}

/**
 * The half of {@link resolveConstructionOptions} a parsed ICN determines on its own — everything
 * but the position fallback, which is the only part needing the variant module. Callers whose ICN
 * always carries an explicit position use this directly, and stay synchronous.
 * @param positionSource - The position to build from. Defaults to the ICN's own, or empty if it
 *   carries none — pass the variant's when you want a tag-only ICN to resolve to its position.
 */
function constructionOptionsFromLongFormat(
	longFormat: LongFormatOut,
	overrides?: ConstructionOverrides,
	positionSource?: { position: Map<CoordsKey, number>; specialRights: Set<CoordsKey> },
): PositionedConstructionOptions {
	// The ICN's date is both the game's start and the variant revision it declares itself of.
	const dateTimestamp = metadatautil.resolveTimestampFromMetadata(longFormat.metadata.UTCDate, longFormat.metadata.UTCTime); // prettier-ignore
	const code = variantregistry.resolveVariantCode(longFormat.metadata.Variant);

	const additional: PositionedConstructionOptions['additional'] = {
		variantOptions: icnimport.variantOptionsFromLongFormat(longFormat, positionSource),
		...overrides,
	};
	// FUTURE: transfer the pasted move comments into the gamefile here, too.
	if (longFormat.moves) additional.moves = icnimport.movePacketsFromParsed(longFormat.moves);

	return {
		timeControl: longFormat.metadata.TimeControl ?? '-',
		variant: code !== undefined ? { code, dateTimestamp } : undefined,
		dateTimestamp,
		presetAnnotes: longFormat.presetAnnotes,
		additional,
	};
}

/**
 * Builds the gamefile from already-resolved construction options.
 * REQUIRES the variant module preloaded whenever `options.variant` is defined.
 * @param validateMoves - If true, we'll throws an IllegalMoveError if any move played is illegal.
 */
function constructGame(options: GameConstructionOptions, validateMoves?: true): GameFile {
	const variant = options.variant && {
		...options.variant,
		mod: variantcache.getModule(options.variant.code),
	};
	return gamefile.initGameFile(
		options.timeControl,
		options.dateTimestamp,
		variant,
		options.additional,
		validateMoves,
	);
}

// Exports ---------------------------------------------------------------------

export default {
	formulateGame,
	tryFormulateGame,
	constructPosition,
	resolveConstructionOptions,
	constructionOptionsFromLongFormat,
};
