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
 * Resolves a parsed ICN into everything its gamefile is constructed from: the variant
 * (preloaded), the timestamps, and the position + moves as gamefile options.
 *
 * Consumers each resolve from the longformat rather than sharing one derived set of
 * options, since the options are mutated during construction, and consumers disagree
 * on them (the validation gate normalizes `fullMove`, a real load preserves it).
 */
async function resolveConstructionOptions(
	longFormat: LongFormatOut,
	overrides?: { gameConclusion?: GameConclusion; slideLimit?: bigint },
): Promise<GameConstructionOptions> {
	const variant = variantregistry.resolveVariantCode(longFormat.metadata.Variant);
	if (longFormat.position === undefined && variant === undefined)
		throw Error(
			'Cannot construct a game from a longformat specifying neither a position nor a known variant.',
		);

	// initGameFile requires the variant module preloaded.
	if (variant !== undefined) await variantcache.ensureVariantLoaded(variant);
	const { position, specialRights } = await icnimport.getPositionAndSpecialRightsFromLongFormat(longFormat, variant); // prettier-ignore

	const additional: Additional = {
		variantOptions: icnimport.variantOptionsFromLongFormat(longFormat, {
			position,
			specialRights,
		}),
		...(overrides?.gameConclusion !== undefined && {
			gameConclusion: overrides.gameConclusion,
		}),
		...(overrides?.slideLimit !== undefined && { slideLimit: overrides.slideLimit }),
	};
	// FUTURE: transfer the pasted move comments into the gamefile here too.
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
 * REQUIRES the variant module preloaded, which {@link resolveConstructionOptions} does.
 * @param validateMoves - Throws an IllegalMoveError if any move played is illegal.
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

/**
 * Constructs the gamefile a parsed ICN describes. Requires the position to be spelled out
 * in the ICN — it is never sourced from the Variant metadata, so a tiny metadata-only
 * string can't stand in for a massive preset position.
 * @param validateMoves - Throws an IllegalMoveError if any move played is illegal.
 * Any other throw means the game couldn't be constructed at all.
 */
async function formulateGame(longFormat: LongFormatOut, validateMoves?: true): Promise<GameFile> {
	if (longFormat.position === undefined || longFormat.state_global.specialRights === undefined)
		throw Error(
			'Invalid longformat when formulating game: Missing position or special rights.',
		);
	const constructionOptions = await resolveConstructionOptions(longFormat);
	return constructGame(constructionOptions, validateMoves);
}

/**
 * Constructs the gamefile of an explicit position and its moves list, validating in the
 * process that no move will crash the game from either a missing piece on the start square,
 * or promoting to a piece that space wasn't allocated for in the piece lists (not in
 * promotion pieces). Synchronous, since resolving no variant means nothing to fetch.
 * @param revealErrors - Whether the caller surfaces invalid moves to the user. Affects
 *   whether we console error here the internal error on invalid moves.
 * @returns The constructed gamefile, or `'moves_invalid'` if construction crashed.
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

export default {
	resolveConstructionOptions,
	formulateGame,
	tryConstructGame,
};
