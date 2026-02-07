// src/client/scripts/esm/workers/icnvalidator.worker.ts

/**
 * The web worker script for the ICN Validator Tool.
 */

import winconutil from '../../../../shared/chess/util/winconutil.js';
import icnconverter from '../../../../shared/chess/logic/icn/icnconverter.js';
import { players as p } from '../../../../shared/chess/util/typeutil.js';

import gameformulator from '../game/chess/gameformulator.js';

// Define types
export interface WorkerMessage {
	chunkId: number;
	games: { index: number; icn: string }[];
}

export interface WorkerResult {
	chunkId: number;
	results: {
		success: boolean;
		icnconverterErrors: number;
		formulatorErrors: number;
		illegalMoveErrors: number;
		terminationMismatchErrors: number;
		errors: any[];
		variantErrors: Record<string, any>;
	};
}

// Listen for the main thread to send data
self.onmessage = (e: MessageEvent<WorkerMessage>) => {
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
			let longFormat: any;
			try {
				longFormat = icnconverter.ShortToLong_Format(gameICN);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
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
			const variant = longFormat.metadata?.Variant || 'Unknown';
			const termination = longFormat.metadata?.Termination;
			const result = longFormat.metadata?.Result;

			// Stage 2: Formulate (No validation)
			let game: any;
			try {
				game = gameformulator.formulateGame(longFormat);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				localResults.formulatorErrors++;
				localResults.errors.push({
					gameIndex: index,
					phase: 'formulator',
					error: message,
					variant: variant,
					icn: gameICN,
				});
				incrementVariantError(variant, 'formulator');
				continue;
			}

			// Stage 3: Validate Moves
			try {
				gameformulator.formulateGame(longFormat, true);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				localResults.illegalMoveErrors++;
				localResults.errors.push({
					gameIndex: index,
					phase: 'illegal-move',
					error: message,
					variant: variant,
					icn: gameICN,
				});
				incrementVariantError(variant, 'illegal');
				continue;
			}

			// Stage 4: Termination Check
			try {
				validateTermination(termination, result, game.basegame.gameConclusion);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				localResults.terminationMismatchErrors++;
				localResults.errors.push({
					gameIndex: index,
					phase: 'termination-mismatch',
					error: message,
					variant: variant,
					termination: termination,
					result: result,
					gameConclusion: game.basegame.gameConclusion,
					icn: gameICN,
				});
				incrementVariantError(variant, 'termination');
				continue;
			}

			// If we got here, game is valid
			localResults.successfulCount++;
		} catch (error) {
			// Unexpected
			const message = error instanceof Error ? error.message : String(error);
			localResults.formulatorErrors++;
			localResults.errors.push({
				gameIndex: index,
				phase: 'unknown',
				error: message,
				icn: gameICN,
			});
		}

		// Report progress every 50 games (optional optimization to keep UI responsive)
		if (localResults.successfulCount % 10 === 0) {
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
	gameConclusion: string | undefined,
): void {
	if (termination === 'Draw by maximum moves reached') {
		if (gameConclusion !== undefined)
			throw new Error(
				`Termination is "Draw by maximum moves reached" but gameConclusion is defined: ${gameConclusion}`,
			);
		return;
	}
	if (termination && termination.startsWith('Material adjudication')) {
		if (gameConclusion !== undefined)
			throw new Error(
				`Termination is Material Adjudication but gameConclusion is defined: ${gameConclusion}`,
			);
		return;
	}
	if (termination === 'Loss on time') {
		if (gameConclusion !== undefined)
			throw new Error(
				`Termination is Loss on time but gameConclusion is defined: ${gameConclusion}`,
			);
		return;
	}
	if (gameConclusion === undefined) {
		if (termination)
			throw new Error(
				`gameConclusion is undefined but Termination is specified: ${termination}`,
			);
		return;
	}

	const { victor, condition } = gameConclusion;

	const conditionMappings: Record<string, string> = {
		Checkmate: 'checkmate',
		'Draw by stalemate': 'stalemate',
		'Draw by threefold repetition': 'repetition',
		'Draw by fifty-move rule': 'moverule',
		'Draw by insufficient material': 'insuffmat',
	};

	if (termination && termination.startsWith('Win by capturing all')) {
		if (condition !== 'allpiecescaptured')
			throw new Error(`Termination/Condition mismatch: ${termination} vs ${condition}`);
	} else if (termination && termination in conditionMappings) {
		if (condition !== conditionMappings[termination])
			throw new Error(`Termination/Condition mismatch: ${termination} vs ${condition}`);
	} else if (termination) {
		throw new Error(`Unknown Termination metadata: "${termination}"`);
	}

	if (victor !== undefined && result) {
		const resultMappings: Record<string, number> = {
			'1-0': p.WHITE,
			'0-1': p.BLACK,
			'1/2-1/2': p.NEUTRAL,
		};
		if (result in resultMappings) {
			if (victor !== resultMappings[result])
				throw new Error(`Result "${result}" does not match victor ${victor}`);
		} else {
			throw new Error(`Unknown Result metadata: "${result}"`);
		}
	}
}
