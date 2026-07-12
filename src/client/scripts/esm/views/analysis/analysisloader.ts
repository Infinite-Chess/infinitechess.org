// src/client/scripts/esm/views/analysis/analysisloader.ts

/**
 * The analysis page's game loader: the small subset of load paths the analysis
 * board needs — a fresh local board of a variant, and pasting a game from ICN.
 */

import type { Additional } from '../../../../../shared/chess/logic/gamefile.js';
import type { VariantCode } from '../../../../../shared/chess/variants/variantregistry.js';
import type { LongFormatOut } from '../../../../../shared/chess/logic/icn/icnconverter.js';
import type { TimeControl, DeadGameState } from '../../../../../shared/types.js';

import uuid from '../../../../../shared/util/uuid.js';
import icnimport from '../../../../../shared/chess/logic/icn/icnimport.js';
import icnconverter from '../../../../../shared/chess/logic/icn/icnconverter.js';
import metadatautil from '../../../../../shared/chess/util/metadatautil.js';
import { players as p } from '../../../../../shared/chess/util/typeutil.js';
import { GameConclusion } from '../../../../../shared/chess/util/winconutil.js';

import toast from '../../components/toast.js';
import gameslot from '../../game/chess/gameslot.js';
import guiclock from '../../game/gui/guiclock.js';
import gamesession from '../../game/chess/gamesession.js';
import analysisactions from './gui/guianalysisactions.js';
import clientmetadatautil from '../../game/chess/clientmetadatautil.js';

/** The variant picker dropdown; absent on the read-only loaded-game view. */
const element_VariantSelect = document.getElementById('variant-select') as HTMLSelectElement | null;

/** Wires the variant picker and defaults a blank dropdown to Classical. */
function init(): void {
	// The hidden "Custom position" placeholder is the select's first option;
	// a fresh board should start on Classical instead.
	if (element_VariantSelect && !element_VariantSelect.value)
		element_VariantSelect.value = 'Classical';

	element_VariantSelect?.addEventListener('change', () => {
		const code = element_VariantSelect.value;
		if (code === '') return; // The hidden "Custom" placeholder.
		if (gamesession.isLoading()) return toast.showPleaseWaitForTask();
		loadVariant(code as VariantCode);
		element_VariantSelect.blur();
	});
}

/** Loads the game named by the URL, falling back to a fresh board of the selected variant. */
async function loadInitialGame(): Promise<void> {
	const pendingImport = analysisactions.takePendingImport();
	const gameId = window.analysisPageData.gameId;

	if (pendingImport !== null) {
		// An ICN import on a loaded game's page redirects here (this page renders no
		// clocks/players/result banner to conflict with) with the text stashed for us.
		gamesession.setSessionGame({ type: 'analysis' }); // pasteGame requires an analysis session.
		analysisactions.importIcnText(pendingImport);
	} else if (gameId === null) {
		// No game ID in the URL -> start a fresh board
		loadVariant(getSelectedVariant());
	} else {
		// Load the game from the server
		gamesession.setSessionGame({ type: 'analysis' }); // pasteGame requires an analysis session.
		try {
			const response = await fetch(`/api/game/${uuid.base10ToBase62(gameId)}`);
			if (!response.ok) throw new Error(`Game fetch failed (${response.status})`);
			const state: DeadGameState = await response.json();
			const longformOut = icnconverter.ShortToLong_Format(state.icn);
			syncVariantSelect(longformOut.metadata.Variant);
			// Auto-orient the board to the side the viewer played from
			// (black flips it; spectators/white keep white's perspective).
			const viewWhitePerspective = window.analysisPageData.role !== p.BLACK;
			await pasteGame(longformOut, state.gameConclusion, viewWhitePerspective);
			syncClockDisplayToViewedMove(true);
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

/** The variant currently selected in the dropdown, defaulting to Classical. */
function getSelectedVariant(): VariantCode {
	return (element_VariantSelect?.value || 'Classical') as VariantCode;
}

/** Loads a fresh board of the given variant, replacing the current game. */
function loadVariant(variant: VariantCode): void {
	if (gameslot.getGamefile()) gamesession.unloadGame();
	startGame({ variant, timeControl: '-' });
}

/**
 * Points the variant dropdown at the given variant metadata name.
 * Unrecognized/custom variants select the hidden "Custom" option.
 */
function syncVariantSelect(variantMetadata: string | undefined): void {
	if (!element_VariantSelect) return;
	if (!variantMetadata) return void (element_VariantSelect.value = '');
	// Option values are variant codes; the metadata name may be a display name.
	// Try the code directly first, then match by option label.
	const byCode = [...element_VariantSelect.options].find((o) => o.value === variantMetadata);
	const byName = [...element_VariantSelect.options].find((o) => o.text === variantMetadata);
	element_VariantSelect.value = (byCode ?? byName)?.value ?? '';
}

/**
 * Syncs the clock display to the currently viewed move.
 * @param remapBars - If true, also re-maps which bar each player's clock occupies.
 */
function syncClockDisplayToViewedMove(remapBars = false): void {
	const gamefile = gameslot.getGamefile()!;
	if (remapBars) guiclock.set(gamefile);
	guiclock.showViewedMoveClockStamps(gamefile);
}

/** Starts a fresh local game of the given variant. */
function startGame(options: { variant: VariantCode; timeControl: TimeControl }): void {
	gamesession.setSessionGame({ type: 'analysis' });
	gameslot
		.loadGamefile({
			timeControl: options.timeControl,
			variant: options.variant,
			dateTimestamp: Date.now(),
			viewWhitePerspective: true,
		})
		.then(({ graphical }) => {
			gamesession.concludeGameIfOver();
			return graphical;
		})
		.then(() => gamesession.markLoadingDone()) // Graphical loaded
		.catch((err: Error) => gamesession.onCatchLoadingError(err));
}

/**
 * Loads a game from the provided ICN longformat, replacing the current one.
 * Requires an active 'analysis' session.
 *
 * TODO: REMOVE A LOT OF THE REDUNDANT LOGIC BETWEEN
 * THIS FUNCTION AND gameforulator.formulateGame()!!!!!!!!
 *
 * @param longformOut - The game in longformat (from parsing the icn).
 * @param gameConclusion - The game's conclusion, if it ended.
 * @param viewWhitePerspective - Board orientation override; defaults to retaining
 * the current game's perspective, or white's if this is the initial load.
 */
async function pasteGame(
	longformOut: LongFormatOut,
	gameConclusion?: GameConclusion,
	viewWhitePerspective?: boolean,
): Promise<void> {
	// Build the gamefile options from the longformat...

	// Resolve variant code from the ICN metadata, normalizing it to the English display name.
	const variant = clientmetadatautil.resolveAndNormalizeVariantFromMetadata(longformOut.metadata);
	const dateTimestamp = metadatautil.resolveTimestampFromMetadata(longformOut.metadata.UTCDate, longformOut.metadata.UTCTime); // prettier-ignore
	const { position, specialRights } = await icnimport.getPositionAndSpecialRightsFromLongFormat(longformOut, variant); // prettier-ignore

	const additional: Additional = {
		variantOptions: icnimport.variantOptionsFromLongFormat(longformOut, {
			position,
			specialRights,
		}),
		gameConclusion,
	};
	// FUTURE: transfer the pasted move comments into the gamefile here too.
	if (longformOut.moves) additional.moves = icnimport.movePacketsFromParsed(longformOut.moves);

	// Explicit override (e.g. the loaded game's participant orientation) wins; otherwise retain
	// the current game's perspective, defaulting to white's on the initial /analysis/:id load.
	const vwp =
		viewWhitePerspective ?? (gameslot.getGamefile() ? gameslot.areViewingWhite() : true);

	if (gameslot.getGamefile()) gameslot.unloadGame();

	gamesession.markLoading();

	// Returned so callers can await the load (the gamefile only exists once it resolves).
	return gameslot
		.loadGamefile({
			timeControl: longformOut.metadata.TimeControl ?? '-',
			variant,
			dateTimestamp,
			viewWhitePerspective: vwp,
			presetAnnotes: longformOut.presetAnnotes,
			additional,
		})
		.then(({ graphical }) => {
			gamesession.concludeGameIfOver(); // Logical loaded: conclude if already-over.
			return graphical;
		})
		.then(() => gamesession.markLoadingDone()) // Graphical loaded
		.catch((err: Error) => gamesession.onCatchLoadingError(err));
}

export default {
	init,
	startGame,
	pasteGame,
	loadInitialGame,
	syncClockDisplayToViewedMove,
};
