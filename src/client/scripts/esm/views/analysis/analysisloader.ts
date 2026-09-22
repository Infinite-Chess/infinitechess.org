// src/client/scripts/esm/views/analysis/analysisloader.ts

/**
 * The analysis page's game loader: the small subset of load paths the analysis
 * board needs — a fresh local board of a variant, and pasting a game from ICN.
 */

import type { VariantCode } from '../../../../../shared/chess/util/variantcodes.js';
import type { DeadGameState } from '../../../../../shared/transport/domain.js';
import type { LongFormatOut } from '../../../../../shared/chess/logic/icn/icnconverter.js';
import type { GameConclusion } from '../../../../../shared/chess/util/typeschemas.js';
import type {
	Additional,
	GameFile,
	VariantOptions,
} from '../../../../../shared/chess/logic/gamefile.js';

import uuid from '../../../../../shared/util/uuid.js';
import modutil from '../../../../../shared/chess/util/modutil.js';
import icnconverter from '../../../../../shared/chess/logic/icn/icnconverter.js';
import gameformulator from '../../../../../shared/chess/game/gameformulator.js';
import { players as p } from '../../../../../shared/chess/util/typeutil.js';

import toast from '../../components/toast.js';
import gameslot from '../../game/chess/gameslot.js';
import gamesession from '../../game/chess/gamesession.js';
import guianalysisview from './gui/guianalysisview.js';
import clientmetadatautil from '../../chess/clientmetadatautil.js';

// State -----------------------------------------------------------------------

/**
 * What produced the currently-loaded game: how to replay it, and the participants it carried.
 *
 * Each load path records itself here with the arguments it was given, so the pristine game can be
 * restored without asking whoever chose it (the variant setup panel, the URL) to derive it again.
 * The participants ride along because the gamefile doesn't retain them (construction drops
 * everything but the position, rules, and moves) and the Game Review's stat columns need them.
 */
let lastLoad:
	| { replay: () => Promise<void>; players: { White?: string; Black?: string } }
	| undefined;

function getPastedPlayers(): { White?: string; Black?: string } {
	return lastLoad?.players ?? {};
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
		// The slide limit comes from the game's stored config, the ICN carries no modifiers.
		const slideLimit = modutil.slideLimitOf(state.setup.modifiers);
		await pasteGame(longFormat, state.gameConclusion, viewWhitePerspective, slideLimit);
		// Only a game fetched from the server gets a result banner. Deliberately NOT done for the other load paths.
		gamesession.concludeGameIfOver();
		guianalysisview.syncClockDisplayToViewedMove(true);
	} catch (e) {
		// This can only be reached if the game was deleted from the DB between
		// SSR'ing (otherwise we would have seen a 404 page) and the client fetch.
		// Don't fall back to a fresh board — the SSR'd game info stays in the
		// sidebar, so a blank board beside it be a lie.
		console.error('Failed to load game for analysis:', e);
		toast.show('Failed to load game. Please refresh.', { error: true });
	}
}

/**
 * Loads a fresh board of the given variant, replacing the current game.
 * @param slideLimit - Optional Slide Limit modifier override (see the variant setup panel).
 */
function loadVariant(variant: VariantCode, slideLimit?: bigint): Promise<void> {
	lastLoad = { replay: () => loadVariant(variant, slideLimit), players: {} };
	const dateTimestamp = Date.now();
	return gamesession.loadGame({
		kind: 'construct',
		timeControl: '-',
		variant: { code: variant, dateTimestamp },
		dateTimestamp,
		viewWhitePerspective: true,
		additional: slideLimit !== undefined ? { slideLimit } : undefined,
	});
}

/**
 * Loads a pre-resolved custom position (VariantOptions) onto the board, replacing
 * the current one. Skips the longformat resolution {@link pasteGame} performs.
 * Requires an active 'analysis' session.
 * @param slideLimit - Optional Slide Limit modifier override (see the variant setup panel).
 */
function loadVariantOptions(variantOptions: VariantOptions, slideLimit?: bigint): Promise<void> {
	lastLoad = { replay: () => loadVariantOptions(variantOptions, slideLimit), players: {} };
	const additional: Additional = {
		variantOptions,
		slideLimit,
	};

	return gamesession.loadGame({
		kind: 'construct',
		timeControl: '-',
		variant: undefined, // Custom position — no preset variant; variantOptions drives everything.
		dateTimestamp: Date.now(),
		viewWhitePerspective: resolveViewPerspective(),
		additional,
	});
}

/**
 * Loads a game from the provided ICN longformat, replacing the current one.
 * Requires an active 'analysis' session.
 *
 * @param longFormat - The game as a parsed ICN. Its `gameRules` are copied during construction,
 * but its `position` and `state_global.specialRights` are retained by reference on the gamefile's
 * startSnapshot — callers must not mutate them afterward.
 * @param gameConclusion - The game's conclusion, if it ended.
 * @param viewWhitePerspective - Board orientation override; defaults to retaining
 * the current game's perspective, or white's if this is the initial load.
 * @param slideLimit - Optional Slide Limit modifier override (see the variant setup panel).
 */
async function pasteGame(
	longFormat: LongFormatOut,
	gameConclusion?: GameConclusion,
	viewWhitePerspective?: boolean,
	slideLimit?: bigint,
): Promise<void> {
	recordPaste(longFormat, gameConclusion, viewWhitePerspective, slideLimit);
	const constructionOptions = await gameformulator.resolveConstructionOptions(longFormat, {
		gameConclusion,
		slideLimit,
	});

	// Returned so callers can await the load (the gamefile only exists once it resolves).
	return gamesession.loadGame({
		kind: 'construct',
		...constructionOptions,
		viewWhitePerspective: resolveViewPerspective(viewWhitePerspective),
	});
}

/**
 * Loads an already-constructed game onto the board — the one the variant selector built to
 * validate the ICN, handed over instead of built a second time. The board owns and mutates it
 * from here, so the selector must have dropped its own reference.
 * Requires an active 'analysis' session.
 *
 * @param longFormat - The parse the game was built from, for {@link recordPaste}.
 * @param slideLimit - The Slide Limit the game was BUILT with. Not applied here — the game
 * already carries it — only kept so a rebuild reaches the same board.
 */
function pastePrebuiltGame(
	gamefile: GameFile,
	longFormat: LongFormatOut,
	slideLimit?: bigint,
): Promise<void> {
	recordPaste(longFormat, undefined, undefined, slideLimit);

	return gamesession.loadGame({
		kind: 'prebuilt',
		gamefile,
		presetAnnotes: longFormat.presetAnnotes,
		viewWhitePerspective: resolveViewPerspective(),
	});
}

// Helpers ---------------------------------------------------------------------

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
	slideLimit?: bigint,
): void {
	// English display name, or dropped if unrecognized, so a rebuild carries canonical metadata.
	clientmetadatautil.resolveAndNormalizeVariantFromMetadata(longFormat.metadata);
	const { White, Black } = longFormat.metadata;
	lastLoad = {
		replay: () => pasteGame(longFormat, gameConclusion, viewWhitePerspective, slideLimit),
		players: { White, Black },
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
	getPastedPlayers,
	reloadPristine,
	loadGameById,
	loadVariant,
	loadVariantOptions,
	pasteGame,
	pastePrebuiltGame,
};
