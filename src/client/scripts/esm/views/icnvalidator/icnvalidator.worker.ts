// src/client/scripts/esm/views/icnvalidator/icnvalidator.worker.ts

/**
 * The web worker script for the ICN Validator Tool.
 */

import type { GameFile } from '../../../../../shared/chess/logic/gamefile.js';
import type { LongFormatOut } from '../../../../../shared/chess/logic/icn/icnconverter.js';
import type { GameConclusion } from '../../../../../shared/chess/util/typeschemas.js';

import jsutil from '../../../../../shared/util/jsutil.js';
import icnconverter from '../../../../../shared/chess/logic/icn/icnconverter.js';
import metadatautil from '../../../../../shared/chess/util/metadatautil.js';
import gameformulator from '../../../../../shared/chess/game/gameformulator.js';
import { IllegalMoveError } from '../../../../../shared/chess/logic/movepiece.js';

// Define types
interface WorkerMessage {
	chunkId: number;
	games: { index: number; icn: string }[];
}

// Listen for the main thread to send data
self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
	const { chunkId, games } = e.data;

	const localResults = {
		success: true,
		successfulCount: 0,
		icnconverterErrors: 0,
		formulatorErrors: 0,
		illegalMoveErrors: 0,
		terminationMismatchErrors: 0,
		errors: [] as any[],
		variantErrors: {} as Record<string, any>,
	};

	// Helper for variant stats
	const incrementVariantError = (variantName: string, type: string): void => {
		if (!localResults.variantErrors[variantName]) {
			localResults.variantErrors[variantName] = {
				total: 0,
				icn: 0,
				formulator: 0,
				illegal: 0,
				termination: 0,
			};
		}
		localResults.variantErrors[variantName].total++;
		localResults.variantErrors[variantName][type]++;
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
				const illegalMove = error instanceof IllegalMoveError;
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

			// Stage 3: Termination Check
			try {
				validateTermination(termination, result, game.gameConclusion);
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

		// Report progress every 50 games (optional optimization to keep UI responsive)
		if (
			(localResults.successfulCount +
				localResults.icnconverterErrors +
				localResults.formulatorErrors +
				localResults.illegalMoveErrors +
				localResults.terminationMismatchErrors) %
				10 ===
			0
		) {
			self.postMessage({ type: 'progress', chunkId, count: 10 });
		}
	}

	// Send final results for this chunk
	self.postMessage({ type: 'done', chunkId, results: localResults });
};

// --- Helper Logic ---

function validateTermination(
	termination: string | undefined,
	result: string | undefined,
	gameConclusion: GameConclusion | undefined,
): void {
	if (termination === 'Maximum moves reached') {
		if (gameConclusion !== undefined)
			throw new Error(`Termination is "Maximum moves reached" but game is over: ${JSON.stringify(gameConclusion)}`); // prettier-ignore
		return;
	}
	if (termination && termination.startsWith('Material adjudication')) {
		if (gameConclusion !== undefined)
			throw new Error(`Termination is Material Adjudication, but game is over: ${JSON.stringify(gameConclusion)}`); // prettier-ignore
		return;
	}
	if (gameConclusion === undefined) {
		if (termination)
			throw new Error(`Game isn't over, but Termination is specified: "${termination}"`);
		return;
	}

	const { victor, condition } = gameConclusion;

	const conditionMappings: Record<string, string> = {
		Checkmate: 'checkmate',
		'All pieces captured': 'allpiecescaptured',
		'Royal capture': 'royalcapture',
		'All royals captured': 'allroyalscaptured',
		Stalemate: 'stalemate',
		'Threefold repetition': 'repetition',
		'50-move rule': 'moverule',
		'Insufficient material': 'insuffmat',
	};

	if (termination && termination in conditionMappings) {
		if (condition !== conditionMappings[termination])
			throw new Error(`Game is over by ${condition}, but Termination is "${termination}"`);
	} else if (termination) {
		throw new Error(`Disallowed Termination metadata: "${termination}"`);
	}

	if (victor !== undefined && result && victor !== metadatautil.getVictorFromResult(result)) {
		throw new Error(`Result "${result}" does not match victor ${victor}`);
	}
}
