// src/client/scripts/esm/game/chess/gameformulator.ts

/**
 * The single path from a parsed ICN (longformat) to a constructed gamefile, shared by
 * the analysis paste, the ICN validator tool, and the variant selector's validation gate.
 */

import type { VariantCode } from '../../../../../shared/chess/variants/variantregistry.js';
import type { GameConclusion } from '../../../../../shared/chess/util/winconutil.js';
import type { MovePacket, TimeControl } from '../../../../../shared/types.js';
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
 * Constructs the gamefile a parsed ICN describes. Requires the position to be
 * spelled out in the ICN — it is not sourced from the Variant metadata here.
 * @param validateMoves - Throws an IllegalMoveError if any move played is illegal.
 * @throws Any other error if the game couldn't be constructed at all.
 */
async function formulateGame(longFormat: LongFormatOut, validateMoves?: true): Promise<GameFile> {
	if (longFormat.position === undefined || longFormat.state_global.specialRights === undefined)
		throw Error('Invalid longformat when formulating game: Missing position or special rights.'); // prettier-ignore
	const constructionOptions = resolveConstructionOptions(longFormat);
	if (constructionOptions.variant !== undefined)
		await variantcache.ensureVariantLoaded(constructionOptions.variant);
	return constructGame(constructionOptions, validateMoves);
}

/**
 * Constructs the gamefile of an explicit position and its moves list, validating in the
 * process that no move will crash the game from either a missing piece on the start square,
 * or promoting to a piece that space wasn't allocated for in the piece lists (not in
 * promotion pieces).
 * @param revealErrors - Whether the caller surfaces invalid moves to the user. Affects
 *   whether we console error here the internal error on invalid moves.
 * @returns The constructed gamefile, or `'moves_invalid'` if construction threw.
 */
function tryConstructGame(
	variantOptions: VariantOptions,
	moves: MovePacket[],
	revealErrors: boolean,
): GameFile | 'moves_invalid' {
	try {
		return constructGame({
			timeControl: '-',
			variant: undefined,
			dateTimestamp: Date.now(),
			additional: { variantOptions, moves },
		});
	} catch (e: unknown) {
		if (revealErrors)
			console.error("Pasted ICN's moves are invalid:", e instanceof Error ? e.message : e);
		return 'moves_invalid';
	}
}

/**
 * Resolves a parsed ICN into everything its gamefile is constructed from:
 * the variant, the timestamps, and the position + moves as gamefile options.
 *
 * REQUIRES the variant module preloaded only if the ICN omits a position (then the position
 * is read off the variant); callers own this.
 */
function resolveConstructionOptions(
	longFormat: LongFormatOut,
	overrides?: { gameConclusion?: GameConclusion; slideLimit?: bigint },
): GameConstructionOptions {
	const variant = variantregistry.resolveVariantCode(longFormat.metadata.Variant);
	if (longFormat.position === undefined && variant === undefined)
		throw Error('Cannot construct a game from a longformat specifying neither a position nor a known variant.'); // prettier-ignore

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
	resolveConstructionOptions,
	formulateGame,
	tryConstructGame,
};
