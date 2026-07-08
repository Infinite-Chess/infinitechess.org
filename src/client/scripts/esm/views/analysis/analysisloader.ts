// src/client/scripts/esm/views/analysis/analysisloader.ts

/**
 * The analysis page's game loader: the small subset of load paths the analysis
 * board needs — a fresh local board of a variant, and pasting a game from ICN.
 */

import type { Additional } from '../../../../../shared/chess/logic/gamefile.js';
import type { VariantCode } from '../../../../../shared/chess/variants/variantregistry.js';
import type { TimeControl } from '../../../../../shared/types.js';
import type { LongFormatOut } from '../../../../../shared/chess/logic/icn/icnconverter.js';

import boardutil from '../../../../../shared/chess/util/boardutil.js';
import icnimport from '../../../../../shared/chess/logic/icn/icnimport.js';
import metadatautil from '../../../../../shared/chess/util/metadatautil.js';
import { pieceCountToDisableCheckmate } from '../../../../../shared/chess/util/winconutil.js';

import toast from '../../components/toast.js';
import gameslot from '../../game/chess/gameslot.js';
import gamesession from '../../game/chess/gamesession.js';

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
 * @param viewWhitePerspective - Board orientation override (defaults to the current game's perspective).
 */
async function pasteGame(
	longformOut: LongFormatOut,
	viewWhitePerspective?: boolean,
): Promise<void> {
	// Build the gamefile options from the longformat...

	// Resolve variant code from the ICN metadata, normalizing it to the English display name.
	const variant = icnimport.resolveAndNormalizeVariantFromMetadata(longformOut.metadata);
	const dateTimestamp = metadatautil.resolveTimestampFromMetadata(longformOut.metadata.UTCDate, longformOut.metadata.UTCTime); // prettier-ignore
	const { position, specialRights } = await icnimport.getPositionAndSpecialRightsFromLongFormat(longformOut, variant); // prettier-ignore

	const additional: Additional = {
		variantOptions: icnimport.variantOptionsFromLongFormat(longformOut, {
			position,
			specialRights,
		}),
	};
	// FUTURE: transfer the pasted move comments into the gamefile here too.
	if (longformOut.moves) additional.moves = icnimport.movePacketsFromParsed(longformOut.moves);

	// Retain the same perspective as the current loaded game, unless overridden (e.g. flip board).
	// No game loaded yet (initial /analysis/:id load): default to white's perspective.
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
		.then(() => {
			gamesession.markLoadingDone(); // Graphical loaded

			const gamefile = gameslot.getGamefile()!;

			// If there's too many pieces, notify them that the win condition changed from checkmate to royalcapture.
			const pieceCount = boardutil.getPieceCountOfGame(gamefile.pieces);
			if (pieceCount >= pieceCountToDisableCheckmate)
				toast.show('Checkmate win condition was swapped for royal captured.');
		})
		.catch((err: Error) => gamesession.onCatchLoadingError(err));
}

export default {
	startGame,
	pasteGame,
};
