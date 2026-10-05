// src/client/scripts/esm/views/icnvalidator/chunkvalidator.ts

/**
 * Validates a chunk of games: runs each through the site's ICN parser and game
 * builder, then the termination check and, optionally, the movegen check against
 * the engine and the move fingerprint, tallying every failure. Shared by the
 * browser worker and the CLI.
 */

import type { GameFile } from '../../../../../shared/chess/logic/gamefile.js';
import type { MetaData } from '../../../../../shared/chess/util/metadatautil.js';
import type { CoordsKey } from '../../../../../shared/util/coordutil.js';
import type { LegalMoves } from '../../../../../shared/chess/logic/legalmoves.js';
import type { LongFormatOut } from '../../../../../shared/chess/logic/icn/icnconverter.js';
import type { MovegenWasmModule } from './movegencheck.js';
import type {
	ChunkResults,
	ValidationError,
	ValidationRequest,
	VariantErrorType,
} from './icnvalidatorprotocol.js';

import jsutil from '../../../../../shared/util/jsutil.js';
import coordutil from '../../../../../shared/util/coordutil.js';
import boardutil from '../../../../../shared/chess/logic/boardutil.js';
import movepiece from '../../../../../shared/chess/logic/movepiece.js';
import legalmoves from '../../../../../shared/chess/logic/legalmoves.js';
import icnconverter from '../../../../../shared/chess/logic/icn/icnconverter.js';
import gameformulator from '../../../../../shared/chess/game/gameformulator.js';

import chunks from './chunks.js';
import movegencheck from './movegencheck.js';
import movefingerprint from './movefingerprint.js';
import terminationcheck from './terminationcheck.js';

// Types -----------------------------------------------------------------------

/** The optional checks a chunk is validated with. */
interface ValidationOptions {
	/** The engine to compare movegen against. Absent skips the movegen check. */
	wasm?: MovegenWasmModule;
	/** Whether to fingerprint every position's legal moves. */
	fingerprint: boolean;
}

// Constants -------------------------------------------------------------------

/** How many games are validated between progress reports. */
const PROGRESS_INTERVAL = 10;

// Chunk Validation ------------------------------------------------------------

/**
 * Validates every game of the chunk and returns their tallies.
 * @param onProgress - Called with how many more games were validated since its last call.
 */
async function validate(
	games: ValidationRequest['games'],
	options: ValidationOptions,
	onProgress: (count: number) => void,
): Promise<ChunkResults> {
	const results = chunks.createResults();
	for (const [i, { index, icn }] of games.entries()) {
		await validateGame(results, index, icn, options);
		if ((i + 1) % PROGRESS_INTERVAL === 0) onProgress(PROGRESS_INTERVAL);
	}
	return results;
}

/** Parses and builds one game, then runs every check on it. */
async function validateGame(
	results: ChunkResults,
	index: number,
	icn: string,
	options: ValidationOptions,
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

	if (runChecks(results, index, icn, variant, longFormat.metadata, game, options))
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
	options: ValidationOptions,
): boolean {
	let passed = true;

	if (options.wasm || options.fingerprint) {
		const replay = replayPositions(game, options);
		results.fingerprint = (results.fingerprint + replay.fingerprint) >>> 0;
		if (replay.mismatch !== undefined) {
			results.movegenMismatchErrors++;
			const failure: ValidationError = {
				gameIndex: index,
				phase: 'movegen-mismatch',
				error: replay.mismatch,
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

// Position Replay -------------------------------------------------------------

/**
 * Steps through every position of the game, computing the site's legal moves once
 * per position for the movegen check and the fingerprint to share. Returns the
 * movegen mismatches summarized, if any, and the game's fingerprint.
 * Leaves the game at its final position.
 */
function replayPositions(
	game: GameFile,
	options: ValidationOptions,
): { mismatch?: string; fingerprint: number } {
	movepiece.goToMove(game, -1, (move) => movepiece.applyMove(game, move, false, true));

	let first: string | undefined;
	let count = 0;
	let fingerprint = 0;
	for (let ply = 0; ; ply++) {
		const siteMoves = getSiteMoves(game);
		if (options.wasm) {
			const mismatches = movegencheck.compare(game, siteMoves, options.wasm);
			if (mismatches.length > 0) {
				first ??= `ply ${ply}, ${mismatches[0]}`;
				count += mismatches.length;
			}
		}
		if (options.fingerprint)
			fingerprint = (fingerprint + movefingerprint.hashPosition(game, siteMoves)) >>> 0;
		const move = game.moves[ply];
		if (move === undefined) break;
		movepiece.applyMove(game, move, true, true);
	}

	if (first === undefined) return { fingerprint };
	return { mismatch: `${count} mismatch(es). First at ${first}`, fingerprint };
}

/** The side to move's legal moves at the viewed position, keyed by each piece's square. */
function getSiteMoves(game: GameFile): Map<CoordsKey, LegalMoves> {
	const siteMoves = new Map<CoordsKey, LegalMoves>();
	for (const piece of boardutil.iteratePiecesOfColor(game.pieces, game.whosTurn)) {
		siteMoves.set(
			coordutil.getKeyFromCoords(piece.coords),
			legalmoves.calculateAll(game, piece),
		);
	}
	return siteMoves;
}

// Failure Tallies -------------------------------------------------------------

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
