// src/client/scripts/esm/game/chess/gameformulator.ts

/**
 * The single path from a parsed ICN (longformat) to a constructed gamefile, shared by
 * the analysis paste, the ICN validator tool, and the variant selector's validation gate.
 */

import type { VariantCode } from '../../../../../shared/chess/variants/variantregistry.js';
import type { TimeControl } from '../../../../../shared/types.js';
import type { GameConclusion } from '../../../../../shared/chess/util/winconutil.js';
import type { Additional, GameFile, VariantOptions } from '../../../../../shared/chess/logic/gamefile.js'; // prettier-ignore
import type {
	LongFormatOut,
	PresetAnnotes,
} from '../../../../../shared/chess/logic/icn/icnconverter.js';

import gamefile from '../../../../../shared/chess/logic/gamefile.js';
import icnimport from '../../../../../shared/chess/logic/icn/icnimport.js';
import metadatautil from '../../../../../shared/chess/util/metadatautil.js';
import variantcache from '../../../../../shared/chess/variants/variantcache.js';
import variantregistry from '../../../../../shared/chess/variants/variantregistry.js';

// Types ----------------------------------------------------------------------------

/** Everything a gamefile is constructed from. */
export interface GameConstructionOptions {
	/** The time control of the game (e.g. `"600+5"`, or `"-"` for untimed). */
	timeControl: TimeControl;
	/** The variant code. Pass undefined for custom/unknown positions. */
	variant: VariantCode | undefined;
	/** The game's start timestamp in milliseconds since epoch. */
	dateTimestamp: number;
	/** Preset ray overrides for the variant's rays. */
	presetAnnotes?: PresetAnnotes;
	additional?: Additional;
}

// Functions ------------------------------------------------------------------------

/**
 * Constructs the gamefile a parsed ICN describes, sourcing the position
 * from the Variant metadata whenever the ICN omits an explicit one.
 * @param validateMoves - Throws an IllegalMoveError if any move played is illegal.
 * @throws Any other error if the game couldn't be constructed at all.
 */
async function formulateGame(longFormat: LongFormatOut, validateMoves?: true): Promise<GameFile> {
	const constructionOptions = await resolveConstructionOptions(longFormat);
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
): Promise<GameFile | 'moves_invalid'> {
	try {
		return await formulateGame(longFormat);
	} catch (e: unknown) {
		if (revealErrors)
			console.error("Pasted ICN's moves are invalid:", e instanceof Error ? e.message : e);
		return 'moves_invalid';
	}
}

/**
 * Constructs the gamefile of a moveless position, purely so callers can read its
 * computed conclusion.
 * @returns The constructed gamefile, or `null` if the position couldn't be built.
 */
function tryConstructPosition(variantOptions: VariantOptions): GameFile | null {
	try {
		return constructGame({
			timeControl: '-',
			variant: undefined,
			dateTimestamp: Date.now(),
			additional: { variantOptions },
		});
	} catch {
		return null;
	}
}

/**
 * Resolves a parsed ICN into everything its gamefile is constructed from:
 * the variant, the timestamps, and the position + moves as gamefile options.
 *
 * Loads the resolved variant module first, since the position is read off it whenever
 * the ICN omits an explicit one (e.g. server-stored games carrying only Variant + moves).
 * An ICN with neither resolves to an empty position, left for position validation to reject.
 */
async function resolveConstructionOptions(
	longFormat: LongFormatOut,
	overrides?: { gameConclusion?: GameConclusion; slideLimit?: bigint },
): Promise<GameConstructionOptions> {
	const variant = variantregistry.resolveVariantCode(longFormat.metadata.Variant);
	if (variant !== undefined) await variantcache.ensureVariantLoaded(variant);

	const { position, specialRights } = icnimport.getPositionAndSpecialRightsFromLongFormat(longFormat, variant); // prettier-ignore

	const additional: Additional = {
		variantOptions: icnimport.variantOptionsFromLongFormat(longFormat, {
			position,
			specialRights,
		}),
		...(overrides?.gameConclusion !== undefined && { gameConclusion: overrides.gameConclusion }), // prettier-ignore
		...(overrides?.slideLimit !== undefined && { slideLimit: overrides.slideLimit }),
	};
	// FUTURE: transfer the pasted move comments into the gamefile here, too.
	if (longFormat.moves) additional.moves = icnimport.movePacketsFromParsed(longFormat.moves);

	return {
		timeControl: longFormat.metadata.TimeControl ?? '-',
		variant,
		dateTimestamp: metadatautil.resolveTimestampFromMetadata(longFormat.metadata.UTCDate, longFormat.metadata.UTCTime), // prettier-ignore
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
	return gamefile.initGameFile(
		options.timeControl,
		options.dateTimestamp,
		options.variant,
		options.additional,
		validateMoves,
	);
}

export default {
	formulateGame,
	tryFormulateGame,
	tryConstructPosition,
	resolveConstructionOptions,
};
