// src/client/scripts/esm/views/icnvalidator/icnvalidator.worker.ts

/**
 * The ICN validator's worker. Takes one chunk of games and runs each through the
 * site's ICN parser, game builder, optionally the movegen check against the engine,
 * and the termination check, tallying every failure.
 */

import type { GameFile } from '../../../../../shared/chess/logic/gamefile.js';
import type { LongFormatOut } from '../../../../../shared/chess/logic/icn/icnconverter.js';
import type { MovegenWasmModule } from './movegencheck.js';
import type {
	ChunkResults,
	ValidationRequest,
	ValidationResponse,
	VariantErrorType,
} from './icnvalidatorprotocol.js';

import jsutil from '../../../../../shared/util/jsutil.js';
import movepiece from '../../../../../shared/chess/logic/movepiece.js';
import icnconverter from '../../../../../shared/chess/logic/icn/icnconverter.js';
import gameformulator from '../../../../../shared/chess/game/gameformulator.js';

import enginewasm from '../../chess/enginewasm.js';
import movegencheck from './movegencheck.js';
import terminationcheck from './terminationcheck.js';

// Message Handling ------------------------------------------------------------

/** Validates the chunk of games the page sends, posting progress along the way and the tallies at the end. */
self.onmessage = async (e: MessageEvent<ValidationRequest>) => {
	const { chunkId, games, engineUrl } = e.data;

	// One single-threaded engine per worker, for the movegen check
	let wasm: MovegenWasmModule | undefined;
	if (engineUrl !== undefined) {
		try {
			({ wasm } = await enginewasm.load<MovegenWasmModule>(engineUrl, 1));
		} catch (error) {
			console.error('[ICN Validator] Failed to initialize wasm', error);
			const message = `Engine failed to load: ${jsutil.getErrorMessage(error)}`;
			self.postMessage({ type: 'initerror', chunkId, message } satisfies ValidationResponse);
			return;
		}
	}

	const localResults: ChunkResults = {
		successfulCount: 0,
		icnconverterErrors: 0,
		formulatorErrors: 0,
		illegalMoveErrors: 0,
		movegenMismatchErrors: 0,
		terminationMismatchErrors: 0,
		errors: [],
		variantErrors: {},
	};

	// Helper for variant stats
	const incrementVariantError = (variantName: string, type: VariantErrorType): void => {
		if (!localResults.variantErrors[variantName]) {
			localResults.variantErrors[variantName] = {
				total: 0,
				icn: 0,
				formulator: 0,
				illegal: 0,
				movegen: 0,
				termination: 0,
			};
		}
		localResults.variantErrors[variantName]!.total++;
		localResults.variantErrors[variantName]![type]++;
	};

	// Process the batch
	for (const item of games) {
		const { index, icn: gameICN } = item;
		try {
			// Stage 1: Convert ICN to long format
			let longFormat: LongFormatOut;
			try {
				longFormat = icnconverter.ShortToLong_Format(gameICN);
			} catch (error) {
				const message = jsutil.getErrorMessage(error);
				localResults.icnconverterErrors++;
				localResults.errors.push({
					gameIndex: index,
					phase: 'icnconverter',
					error: message,
					icn: gameICN,
				});
				incrementVariantError('Unknown (ICN Parse Failed)', 'icn');
				continue; // Move to next game
			}

			// Extract metadata
			const variant = longFormat.metadata.Variant || 'Unknown';
			const termination = longFormat.metadata.Termination;
			const result = longFormat.metadata.Result;

			// Stage 2: Formulate & validate the moves. An IllegalMoveError means the game
			// built fine but a move was illegal; anything else means it wouldn't build.
			let game: GameFile;
			try {
				game = await gameformulator.formulateGame(longFormat, undefined, true);
			} catch (error) {
				const message = jsutil.getErrorMessage(error);
				const illegalMove = error instanceof movepiece.IllegalMoveError;
				if (illegalMove) localResults.illegalMoveErrors++;
				else localResults.formulatorErrors++;
				localResults.errors.push({
					gameIndex: index,
					phase: illegalMove ? 'illegal-move' : 'formulator',
					error: message,
					variant: variant,
					icn: gameICN,
				});
				incrementVariantError(variant, illegalMove ? 'illegal' : 'formulator');
				continue;
			}

			// Stage 3: Movegen Check, when requested
			if (wasm) {
				try {
					movegencheck.validate(game, wasm);
				} catch (error) {
					localResults.movegenMismatchErrors++;
					localResults.errors.push({
						gameIndex: index,
						phase: 'movegen-mismatch',
						error: jsutil.getErrorMessage(error),
						variant: variant,
						icn: gameICN,
					});
					incrementVariantError(variant, 'movegen');
					continue;
				}
			}

			// Stage 4: Termination Check
			try {
				terminationcheck.validate(termination, result, game.gameConclusion);
			} catch (error) {
				const message = jsutil.getErrorMessage(error);
				localResults.terminationMismatchErrors++;
				localResults.errors.push({
					gameIndex: index,
					phase: 'termination-mismatch',
					error: message,
					variant: variant,
					termination: termination,
					result: result,
					gameConclusion: game.gameConclusion,
					icn: gameICN,
				});
				incrementVariantError(variant, 'termination');
				continue;
			}

			// If we got here, game is valid
			localResults.successfulCount++;
		} catch (error) {
			// Unexpected
			const message = jsutil.getErrorMessage(error);
			localResults.formulatorErrors++;
			localResults.errors.push({
				gameIndex: index,
				phase: 'unknown',
				error: message,
				icn: gameICN,
			});
		}

		// Report progress every 10 games
		if (
			(localResults.successfulCount +
				localResults.icnconverterErrors +
				localResults.formulatorErrors +
				localResults.illegalMoveErrors +
				localResults.movegenMismatchErrors +
				localResults.terminationMismatchErrors) %
				10 ===
			0
		) {
			self.postMessage({ type: 'progress', chunkId, count: 10 } satisfies ValidationResponse);
		}
	}

	// Send final results for this chunk
	self.postMessage({ type: 'done', chunkId, results: localResults } satisfies ValidationResponse);
};
