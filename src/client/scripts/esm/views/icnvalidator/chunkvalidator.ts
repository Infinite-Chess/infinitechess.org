// src/client/scripts/esm/views/icnvalidator/chunkvalidator.ts

/**
 * Validates a chunk of games: runs each through the site's ICN parser and game
 * builder, then the termination check and, optionally, the movegen check against
 * the engine, tallying every failure.
 */

import type { GameFile } from '../../../../../shared/chess/logic/gamefile.js';
import type { MetaData } from '../../../../../shared/chess/util/metadatautil.js';
import type { LongFormatOut } from '../../../../../shared/chess/logic/icn/icnconverter.js';
import type { MovegenWasmModule } from './movegencheck.js';
import type {
	ChunkResults,
	ValidationError,
	ValidationRequest,
	VariantErrorType,
} from './icnvalidatorprotocol.js';

import jsutil from '../../../../../shared/util/jsutil.js';
import movepiece from '../../../../../shared/chess/logic/movepiece.js';
import icnconverter from '../../../../../shared/chess/logic/icn/icnconverter.js';
import gameformulator from '../../../../../shared/chess/game/gameformulator.js';

import chunkresults from './chunkresults.js';
import movegencheck from './movegencheck.js';
import terminationcheck from './terminationcheck.js';

// Constants -------------------------------------------------------------------

/** How many games are validated between progress reports. */
const PROGRESS_INTERVAL = 10;

// Chunk Validation ------------------------------------------------------------

/**
 * Validates every game of the chunk and returns their tallies.
 * @param wasm - The engine to compare movegen against. Absent skips the movegen check.
 * @param onProgress - Called with how many more games were validated since its last call.
 */
async function validate(
	games: ValidationRequest['games'],
	wasm: MovegenWasmModule | undefined,
	onProgress: (count: number) => void,
): Promise<ChunkResults> {
	const results = chunkresults.create();
	for (const [i, { index, icn }] of games.entries()) {
		await validateGame(results, index, icn, wasm);
		if ((i + 1) % PROGRESS_INTERVAL === 0) onProgress(PROGRESS_INTERVAL);
	}
	return results;
}

/** Parses and builds one game, then runs every check on it. */
async function validateGame(
	results: ChunkResults,
	index: number,
	icn: string,
	wasm: MovegenWasmModule | undefined,
): Promise<void> {
	let longFormat: LongFormatOut;
	try {
		longFormat = icnconverter.ShortToLong_Format(icn);
	} catch (error) {
		results.icnconverterErrors++;
		const failure: ValidationError = {
			gameIndex: index,
			phase: 'icnconverter',
			error: jsutil.getErrorMessage(error),
			icn,
		};
		recordFailure(results, failure, 'icn');
		return;
	}

	const variant = longFormat.metadata.Variant || 'Unknown';

	// An IllegalMoveError means the game built fine but a move was illegal; anything else means it wouldn't build.
	let game: GameFile;
	try {
		game = await gameformulator.formulateGame(longFormat, undefined, true);
	} catch (error) {
		const illegalMove = error instanceof movepiece.IllegalMoveError;
		if (illegalMove) results.illegalMoveErrors++;
		else results.formulatorErrors++;
		const failure: ValidationError = {
			gameIndex: index,
			phase: illegalMove ? 'illegal-move' : 'formulator',
			error: jsutil.getErrorMessage(error),
			variant,
			icn,
		};
		recordFailure(results, failure, illegalMove ? 'illegal' : 'formulator');
		return;
	}

	if (runChecks(results, index, icn, variant, longFormat.metadata, game, wasm))
		results.successfulCount++;
}

/** Runs every check on a built game, so one game may fail several. Returns whether all passed. */
function runChecks(
	results: ChunkResults,
	index: number,
	icn: string,
	variant: string,
	metadata: MetaData,
	game: GameFile,
	wasm: MovegenWasmModule | undefined,
): boolean {
	let passed = true;

	if (wasm) {
		try {
			movegencheck.validate(game, wasm);
		} catch (error) {
			results.movegenMismatchErrors++;
			const failure: ValidationError = {
				gameIndex: index,
				phase: 'movegen-mismatch',
				error: jsutil.getErrorMessage(error),
				variant,
				icn,
			};
			recordFailure(results, failure, 'movegen');
			passed = false;
		}
	}

	const { Termination: termination, Result: result } = metadata;
	try {
		terminationcheck.validate(termination, result, game.gameConclusion);
	} catch (error) {
		results.terminationMismatchErrors++;
		const failure: ValidationError = {
			gameIndex: index,
			phase: 'termination-mismatch',
			error: jsutil.getErrorMessage(error),
			variant,
			termination,
			result,
			gameConclusion: game.gameConclusion,
			icn,
		};
		recordFailure(results, failure, 'termination');
		passed = false;
	}

	return passed;
}

/** Lists a failed game, and counts it towards its variant's tally of that failure. */
function recordFailure(
	results: ChunkResults,
	failure: ValidationError,
	type: VariantErrorType,
): void {
	results.errors.push(failure);
	const variant = failure.variant ?? 'Unknown (ICN Parse Failed)';
	const stats = (results.variantErrors[variant] ??= {
		total: 0,
		icn: 0,
		formulator: 0,
		illegal: 0,
		movegen: 0,
		termination: 0,
	});
	stats.total++;
	stats[type]++;
}

// Exports ---------------------------------------------------------------------

export default {
	// Chunk Validation
	validate,
};
