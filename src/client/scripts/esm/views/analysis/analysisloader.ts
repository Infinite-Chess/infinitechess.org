// src/client/scripts/esm/views/analysis/analysisloader.ts

/**
 * The analysis page's game loader: the small subset of load paths the analysis
 * board needs — a fresh local board of a variant, and pasting a game from ICN.
 */

import type { VariantCode } from '../../../../../shared/chess/variants/variantregistry.js';
import type { DeadGameState } from '../../../../../shared/types.js';
import type { LongFormatOut } from '../../../../../shared/chess/logic/icn/icnconverter.js';
import type { Additional, VariantOptions } from '../../../../../shared/chess/logic/gamefile.js';

import uuid from '../../../../../shared/util/uuid.js';
import jsutil from '../../../../../shared/util/jsutil.js';
import icnconverter from '../../../../../shared/chess/logic/icn/icnconverter.js';
import { players as p } from '../../../../../shared/chess/util/typeutil.js';
import { GameConclusion } from '../../../../../shared/chess/util/winconutil.js';

import toast from '../../components/toast.js';
import gamesession from '../../game/chess/gamesession.js';
import gameformulator from '../../game/chess/gameformulator.js';
import guianalysisview from './gui/guianalysisview.js';
import clientmetadatautil from '../../game/chess/clientmetadatautil.js';
import gameslot, { LoadOptions } from '../../game/chess/gameslot.js';

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

// Load Paths -------------------------------------------------------------------

/** Loads the game named by the URL, falling back to a fresh Classical board. */
async function loadInitialGame(): Promise<void> {
	const gameId = window.analysisPageData.gameId;

	if (gameId === null) {
		// No game ID in the URL -> start a fresh board. The variant setup panel drives
		// subsequent loads (see analysissetup.ts).
		await loadVariant('Classical');
	} else {
		// Load the game from the server
		gamesession.setSessionGame({ type: 'analysis' }); // pasteGame requires an analysis session.
		try {
			const response = await fetch(`/api/game/${uuid.base10ToBase62(gameId)}`);
			if (!response.ok) throw new Error(`Game fetch failed (${response.status})`);
			const state: DeadGameState = await response.json();
			// Auto-orient the board to the side the viewer played from
			// (black flips it; spectators/white keep white's perspective).
			const viewWhitePerspective = window.analysisPageData.role !== p.BLACK;
			const longFormat = icnconverter.ShortToLong_Format(state.icn);
			await pasteGame(longFormat, state.gameConclusion, viewWhitePerspective);
			// Only the reviewed game gets a result banner. Deliberately NOT done for the other load paths.
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
}

/**
 * Runs a loadGamefile call through the analysis loading lifecycle
 * (mark graphical done → surface load errors).
 */
function runLoad(loadOptions: LoadOptions): Promise<void> {
	return gameslot
		.loadGamefile(loadOptions)
		.then(({ graphical }) => graphical) // Also await the graphical load
		.then(() => gamesession.markLoadingDone()) // Graphical loaded
		.catch((err: Error) => gamesession.onCatchLoadingError(err));
}

/**
 * Loads a fresh board of the given variant, replacing the current game.
 * @param slideLimit - Optional Slide Limit modifier override (see the variant setup panel).
 */
function loadVariant(variant: VariantCode, slideLimit?: bigint): Promise<void> {
	lastLoad = { replay: () => loadVariant(variant, slideLimit), players: {} };
	if (gameslot.getGamefile()) gamesession.unloadGame();

	gamesession.setSessionGame({ type: 'analysis' });
	return runLoad({
		timeControl: '-',
		variant,
		dateTimestamp: Date.now(),
		viewWhitePerspective: true,
		...(slideLimit !== undefined && {
			additional: { slideLimit },
		}),
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
		// Construction writes to gameRules, and this module retains `variantOptions` for
		// replay — so give construction its own copy of the rules (not the position).
		variantOptions: {
			...variantOptions,
			gameRules: jsutil.deepCopyObject(variantOptions.gameRules),
		},
		...(slideLimit !== undefined && { slideLimit }),
	};

	// Retain the current board's orientation, defaulting to white's.
	const vwp = gameslot.getGamefile() ? gameslot.areViewingWhite() : true;

	if (gameslot.getGamefile()) gameslot.unloadGame();
	gamesession.markLoading();

	return runLoad({
		timeControl: '-',
		variant: undefined, // Custom position — no preset variant; variantOptions drives everything.
		dateTimestamp: Date.now(),
		viewWhitePerspective: vwp,
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
	// Normalize the ICN's Variant metadata to the English display name (or drop it if
	// unrecognized), so the game we go on to display carries canonical metadata.
	clientmetadatautil.resolveAndNormalizeVariantFromMetadata(longFormat.metadata);
	const { White, Black } = longFormat.metadata;
	lastLoad = {
		replay: () => pasteGame(longFormat, gameConclusion, viewWhitePerspective, slideLimit),
		players: { White, Black },
	};
	const constructionOptions = await gameformulator.resolveConstructionOptions(longFormat, {
		gameConclusion,
		slideLimit,
	});

	// Explicit override (e.g. the loaded game's participant orientation) wins; otherwise retain
	// the current game's perspective, defaulting to white's on the initial /analysis/:id load.
	const vwp =
		viewWhitePerspective ?? (gameslot.getGamefile() ? gameslot.areViewingWhite() : true);

	if (gameslot.getGamefile()) gameslot.unloadGame();
	gamesession.markLoading();

	// Returned so callers can await the load (the gamefile only exists once it resolves).
	return runLoad({ ...constructionOptions, viewWhitePerspective: vwp });
}

export default {
	getPastedPlayers,
	reloadPristine,
	loadInitialGame,
	loadVariant,
	loadVariantOptions,
	pasteGame,
};
