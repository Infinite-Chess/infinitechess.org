// src/client/scripts/views/analysis/analysisloader.ts

/**
 * The analysis page's game loader: the small subset of load paths the analysis
 * board needs — a fresh local board of a variant, a custom position, a game pasted
 * from ICN, and a finished game fetched by its id.
 */

import type { VariantCode } from '../../../../shared/chess/util/variantcodes.js';
import type { GameModifier } from '../../../../shared/chess/util/modutil.js';
import type { DeadGameState } from '../../../../shared/transport/domain.js';
import type { LongFormatOut } from '../../../../shared/chess/logic/icn/icnconverter.js';
import type { GameConclusion } from '../../../../shared/chess/util/typeschemas.js';
import type { PrebuiltSource } from '../../board/variantselector/variantselector.js';
import type {
	Additional,
	GameFile,
	VariantOptions,
} from '../../../../shared/chess/logic/gamefile.js';

import uuid from '../../../../shared/util/uuid.js';
import winconutil from '../../../../shared/chess/util/winconutil.js';
import icnconverter from '../../../../shared/chess/logic/icn/icnconverter.js';
import gameformulator from '../../../../shared/chess/game/gameformulator.js';
import { players as p } from '../../../../shared/chess/util/typeutil.js';
import metadatautil, { RecordMetaData } from '../../../../shared/chess/util/metadatautil.js';

import toast from '../../components/toast.js';
import gameslot from '../../game/chess/gameslot.js';
import servertime from '../../util/servertime.js';
import gamesession from '../../game/chess/gamesession.js';
import guianalysisview from './gui/guianalysisview.js';
import clientmetadatautil from '../../chess/clientmetadatautil.js';

// State -----------------------------------------------------------------------

/**
 * What produced the currently-loaded game: how to replay it, and the record metadata it carried.
 *
 * Each load path records itself here with the arguments it was given, so the pristine game can be
 * restored without asking whoever chose it (the variant setup panel, the URL) to derive it again.
 * The record metadata rides along because the gamefile can't derive it.
 */
let lastLoad: { replay: () => Promise<void>; recordMetadata: RecordMetaData } | undefined;

/** The record metadata the currently-loaded game carried, empty for a fresh or custom position. */
function getRecordMetadata(): RecordMetaData {
	return lastLoad?.recordMetadata ?? {};
}

/** Reloads the pristine game, discarding whatever was edited onto it. Resolves once fully loaded. */
function reloadPristine(): Promise<void> {
	return lastLoad?.replay() ?? Promise.resolve();
}

// Load Paths ------------------------------------------------------------------

/**
 * Fetches a finished game from the server by its id and loads it, oriented to the
 * perspective the server resolved for the page (the URL's color segment, else the
 * side the viewer played from).
 */
async function loadGameById(gameId: number): Promise<void> {
	gamesession.markLoading(); // Covers the fetch too, ahead of the load pasteGame flags.
	try {
		const response = await fetch(`/api/game/${uuid.base10ToBase62(gameId)}`);
		if (!response.ok) throw new Error(`Game fetch failed (${response.status})`);
		const state: DeadGameState = await response.json();
		const viewWhitePerspective = window.analysisPageData.viewColor === p.WHITE;
		const longFormat = icnconverter.ShortToLong_Format(state.icn);
		// The modifiers come from the game's stored config, the ICN carries none.
		const { modifiers } = state.setup;
		await pasteGame(longFormat, state.gameConclusion, viewWhitePerspective, modifiers);
		// Only a game fetched from the server gets a result banner. Deliberately NOT done for the other load paths.
		gamesession.concludeGameIfOver();
		guianalysisview.syncClockDisplayToViewedMove(true);
	} catch (e) {
		// This can only be reached if the game was deleted from the DB between
		// SSR'ing (otherwise we would have seen a 404 page) and the client fetch.
		// Don't fall back to a fresh board — the SSR'd game info stays in the
		// sidebar, so a blank board beside it would be a lie.
		console.error('Failed to load game for analysis:', e);
		toast.show(t.gamegui.load_failed, { error: true });
	}
}

/**
 * Loads a fresh board of the given variant, replacing the current game.
 * @param modifiers - The modifiers to play it with (see the variant setup panel).
 */
function loadVariant(variant: VariantCode, modifiers?: GameModifier[]): Promise<void> {
	lastLoad = { replay: () => loadVariant(variant, modifiers), recordMetadata: {} };
	const dateTimestamp = servertime.now();
	return gamesession.loadGame({
		kind: 'construct',
		timeControl: '-',
		variant: { code: variant, dateTimestamp },
		dateTimestamp,
		viewWhitePerspective: true,
		additional: { modifiers },
	});
}

/**
 * Loads a pre-resolved custom position (VariantOptions) onto the board, replacing
 * the current one. Skips the longformat resolution {@link pasteGame} performs.
 * Requires an active 'analysis' session.
 * @param modifiers - The modifiers to play it with (see the variant setup panel).
 */
function loadVariantOptions(
	variantOptions: VariantOptions,
	modifiers?: GameModifier[],
): Promise<void> {
	recordOptions(variantOptions, modifiers);
	const additional: Additional = {
		variantOptions,
		modifiers,
	};

	return gamesession.loadGame({
		kind: 'construct',
		timeControl: '-',
		variant: undefined, // Custom position — no preset variant; variantOptions drives everything.
		dateTimestamp: servertime.now(),
		viewWhitePerspective: resolveViewPerspective(),
		additional,
	});
}

/**
 * Loads a game from the provided ICN longformat, replacing the current one.
 * Requires an active 'analysis' session.
 *
 * @param longFormat - The game as a parsed ICN. Its `position` and `state_global.specialRights`
 * are retained by reference on the gamefile's read-only startSnapshot — callers must not mutate
 * them afterward.
 * @param gameConclusion - The game's conclusion, if it ended.
 * @param viewWhitePerspective - Board orientation override; defaults to retaining
 * the current game's perspective, or white's if this is the initial load.
 * @param modifiers - The modifiers to play it with (see the variant setup panel).
 */
async function pasteGame(
	longFormat: LongFormatOut,
	gameConclusion?: GameConclusion,
	viewWhitePerspective?: boolean,
	modifiers?: GameModifier[],
): Promise<void> {
	recordPaste(longFormat, gameConclusion, viewWhitePerspective, modifiers);
	const constructionOptions = await gameformulator.resolveConstructionOptions(
		longFormat,
		servertime.now(),
		{ gameConclusion, modifiers },
	);

	// Returned so callers can await the load (the gamefile only exists once it resolves).
	return gamesession.loadGame({
		kind: 'construct',
		...constructionOptions,
		viewWhitePerspective: resolveViewPerspective(viewWhitePerspective),
	});
}

/**
 * Loads an already-constructed game onto the board — the one the variant selector built to
 * validate the position, handed over instead of built a second time. The board owns and mutates
 * it from here, so the selector must have dropped its own reference.
 * Requires an active 'analysis' session.
 * @param source - What the game was built from, recorded so {@link reloadPristine} can rebuild it.
 * @param modifiers - The modifiers the game was BUILT with. Not applied here — the game
 * already carries them — only kept so a rebuild reaches the same board.
 */
function pastePrebuiltGame(
	gamefile: GameFile,
	source: PrebuiltSource,
	modifiers?: GameModifier[],
): Promise<void> {
	if (source.kind === 'icn') {
		// The moves decide any ending they can show. The tags only add one they can't, like a resignation.
		const tagged = metadatautil.getConclusionFromMetadata(source.longFormat.metadata);
		if (
			!gamefile.gameConclusion &&
			tagged &&
			!winconutil.isConclusionMoveTriggered(tagged.condition)
		)
			gamefile.gameConclusion = tagged;
		recordPaste(source.longFormat, gamefile.gameConclusion, undefined, modifiers);
	} else recordOptions(source.options, modifiers);

	return gamesession.loadGame({
		kind: 'prebuilt',
		gamefile,
		presetAnnotes: source.kind === 'icn' ? source.longFormat.presetAnnotes : undefined,
		viewWhitePerspective: resolveViewPerspective(),
	});
}

// Helpers ---------------------------------------------------------------------

/**
 * Records a custom position's options so {@link reloadPristine} can rebuild it through
 * {@link loadVariantOptions}. Saved positions carry no record metadata.
 */
function recordOptions(variantOptions: VariantOptions, modifiers?: GameModifier[]): void {
	lastLoad = { replay: () => loadVariantOptions(variantOptions, modifiers), recordMetadata: {} };
}

/**
 * Canonicalizes a pasted ICN's metadata, then records what the game was made from so
 * {@link reloadPristine} can rebuild it. Always rebuilds through {@link pasteGame}, even where the
 * game arrived already built — that one has been played on by the time a rebuild is asked for.
 * Its parameters are {@link pasteGame}'s, since replaying is what they are kept for.
 */
function recordPaste(
	longFormat: LongFormatOut,
	gameConclusion?: GameConclusion,
	viewWhitePerspective?: boolean,
	modifiers?: GameModifier[],
): void {
	// English display name, or dropped if unrecognized, so a rebuild carries canonical metadata.
	clientmetadatautil.resolveAndNormalizeVariantFromMetadata(longFormat.metadata);
	lastLoad = {
		replay: () => pasteGame(longFormat, gameConclusion, viewWhitePerspective, modifiers),
		recordMetadata: metadatautil.trimTo(longFormat.metadata, metadatautil.RECORD_METADATA),
	};
}

/**
 * The perspective to load at: an explicit override (e.g. a loaded game's participant
 * orientation), else the current board's, else white's on the page's first load.
 */
function resolveViewPerspective(override?: boolean): boolean {
	return override ?? (gameslot.getGamefile() ? gameslot.areViewingWhite() : true);
}

// Exports ---------------------------------------------------------------------

export default {
	getRecordMetadata,
	reloadPristine,
	loadGameById,
	loadVariant,
	pasteGame,
	pastePrebuiltGame,
};
