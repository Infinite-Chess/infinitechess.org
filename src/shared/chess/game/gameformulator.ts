// src/shared/chess/game/gameformulator.ts

/**
 * The single path from a parsed ICN (longformat) or an online game's setup to a constructed
 * gamefile, used by both ends — the client to load a game, the server to inspect one.
 */

import type { GameModifier } from '../util/modutil.js';
import type { GameConclusion } from '../util/typeschemas.js';
import type { GameStateVariant } from '../util/variantselection.js';
import type { ClockValues, TimeControl } from '../util/clockutil.js';
import type { LongFormatOut, PresetAnnotes } from '../logic/icn/icnconverter.js';
import type { Additional, DatedVariant, GameFile, VariantOptions } from '../logic/gamefile.js';

import modutil from '../util/modutil.js';
import gamefile from '../logic/gamefile.js';
import icnimport from '../logic/icn/icnimport.js';
import icnconverter from '../logic/icn/icnconverter.js';
import metadatautil from '../util/metadatautil.js';
import variantcache from '../variants/variantcache.js';
import variantregistry from '../variants/variantregistry.js';

// Types -----------------------------------------------------------------------

/**
 * The static setup of a game: how it was configured at creation — variant, clock settings,
 * modifiers, creation time. Unchanging for the game's whole life. SSR'd into `gamePageData`
 * (and the `setup` of `GameStateCore` for the side bar / dead-game HTTP), so it is
 * never sent over the subscribe socket — the client already has it by game-load time.
 */
export interface StaticGameSetup {
	variant: GameStateVariant;
	timeControl: TimeControl;
	/** Epoch milliseconds the game was created. */
	timeCreated: number;
	/** The modifiers applied to this game. Absent if none. */
	modifiers?: GameModifier[];
}

/** Everything a gamefile is constructed from. */
export interface GameConstructionOptions {
	/** The time control of the game (e.g. `"600+5"`, or `"-"` for untimed). */
	timeControl: TimeControl;
	/** The variant, at the revision of it that applies. Pass undefined for custom/unknown positions. */
	variant: DatedVariant | undefined;
	/** The game's start timestamp in milliseconds since epoch. */
	dateTimestamp: number;
	/** Preset square and ray overrides, replacing the variant's own. */
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
 * Constructs the gamefile of a moveless position, purely so callers can
 * inspect the game it produces (its computed conclusion, its engine support).
 * @param variant - The variant the position is of, when one is known — supplying its
 *   movesets, so the inspection sees how the pieces truly move. REQUIRES its module preloaded.
 * @param slideLimit - The Slide Limit modifier the game will be played with, when one is
 * selected. It rebuilds the movesets, affecting validation.
 */
function constructPosition(
	variantOptions: VariantOptions,
	variant?: DatedVariant,
	slideLimit?: bigint,
): GameFile {
	return constructGame({
		timeControl: '-',
		variant,
		dateTimestamp: Date.now(),
		additional: { variantOptions, slideLimit },
	});
}

/**
 * Resolves a parsed ICN into everything its gamefile is constructed from:
 * the variant, the timestamps, and the position + moves as gamefile options.
 *
 * Loads the resolved variant module, since the position is read off it whenever
 * the ICN omits an explicit one (e.g. server-stored games carrying only Variant + moves).
 * An ICN with neither resolves to an empty position, left for position validation to reject.
 * That fallback is the sole reason this is async — see {@link constructionOptionsFromLongFormat}.
 */
async function resolveConstructionOptions(
	longFormat: LongFormatOut,
	overrides?: ConstructionOverrides,
): Promise<GameConstructionOptions> {
	const options = constructionOptionsFromLongFormat(longFormat, overrides);
	if (options.variant === undefined) return options;

	await variantcache.ensureVariantLoaded(options.variant.code);
	const variant = { ...options.variant, mod: variantcache.getModule(options.variant.code) };
	const source = icnimport.getPositionAndSpecialRightsFromLongFormat(longFormat, variant);
	options.additional.variantOptions.position = source.position;
	options.additional.variantOptions.state_global.specialRights = source.specialRights;
	return options;
}

/**
 * The half of {@link resolveConstructionOptions} a parsed ICN determines on its own — everything
 * but the position fallback, which is the only part needing the variant module. Callers whose ICN
 * always carries an explicit position use this directly, and stay synchronous.
 */
function constructionOptionsFromLongFormat(
	longFormat: LongFormatOut,
	overrides?: ConstructionOverrides,
): PositionedConstructionOptions {
	// The ICN's date is both the game's start and the variant revision it declares itself of.
	const dateTimestamp = metadatautil.resolveTimestampFromMetadata(longFormat.metadata.UTCDate, longFormat.metadata.UTCTime); // prettier-ignore
	const code = variantregistry.resolveCode(longFormat.metadata.Variant);

	const additional: PositionedConstructionOptions['additional'] = {
		variantOptions: icnimport.variantOptionsFromLongFormat(longFormat),
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
 * Resolves an online game's static setup into everything its gamefile is constructed from.
 * @param engineGame - Whether one seat is an engine, which a preset's world border depends on.
 * @param progress - The game's moves, conclusion and clocks so far.
 * @param longformat - The game's parsed ICN, if it has one. Required of a dead custom game,
 *   whose start position lives ONLY here; a live one carries it in its setup instead.
 */
function constructionOptionsFromSetup(
	setup: StaticGameSetup,
	engineGame: boolean,
	progress: Additional,
	longformat?: LongFormatOut,
): GameConstructionOptions {
	const { variant, timeControl, timeCreated, modifiers } = setup;
	const additional: Additional = { ...progress, slideLimit: modutil.slideLimitOf(modifiers) };

	// A custom game has no variant code to build its position from — its ICN is the source of
	// truth for the position, the gamerules, and which variant revision it's a position of.
	// (Only the position-defining half of it: time control, moves, clocks and conclusion are the
	// typed state's to declare, and the ICN's player/result tags are eyeball-only.)
	let datedVariant: DatedVariant | undefined;
	let presetAnnotes: PresetAnnotes | undefined;
	if (variant.kind === 'preset') {
		datedVariant = { code: variant.code, dateTimestamp: timeCreated };
		// A preset's rules are rebuilt from its module, which knows nothing of the opponent — so
		// the border an engine game is played inside is resolved separately. A finished game's ICN
		// records the board it was actually played on, so it wins over deriving one now.
		additional.worldBorder = longformat?.gameRules.worldBorder;
		additional.engineGame = engineGame;
	} else {
		let startFormat = longformat;
		if (startFormat === undefined) {
			if (variant.position === undefined)
				throw new Error('Custom game setup carries no start position.');
			startFormat = icnconverter.ShortToLong_Format(variant.position);
		}
		// The sync half suffices: a custom game's ICN always carries an explicit position,
		// so the variant-module fallback the async resolver adds has nothing left to resolve.
		const resolved = constructionOptionsFromLongFormat(startFormat);
		datedVariant = resolved.variant;
		presetAnnotes = resolved.presetAnnotes;
		additional.variantOptions = resolved.additional.variantOptions;
	}

	return {
		timeControl,
		variant: datedVariant,
		// The game's own start time — NOT the variant revision, which a custom
		// position lifted from an older game pins to its own, earlier date.
		dateTimestamp: timeCreated,
		presetAnnotes,
		additional,
	};
}

/**
 * Builds the gamefile from already-resolved construction options.
 * REQUIRES the variant module preloaded whenever `options.variant` is defined.
 * @param validateMoves - If true, throws an IllegalMoveError if any move played is illegal.
 * @throws If the game can't be built at all — nearly always a move that would crash it, such
 * as no piece on its start square, or promoting to a piece no space was allocated for.
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
	constructPosition,
	resolveConstructionOptions,
	constructionOptionsFromLongFormat,
	constructionOptionsFromSetup,
	constructGame,
};
