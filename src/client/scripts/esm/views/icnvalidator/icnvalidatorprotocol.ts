// src/client/scripts/esm/views/icnvalidator/icnvalidatorprotocol.ts

/**
 * The message protocol between the ICN validator page and its workers.
 *
 * The page splits the uploaded games into one chunk per hardware thread, and each
 * worker replays its chunk and reports back the games the site disagreed with.
 */

import type { GameConclusion } from '../../../../../shared/chess/util/typeschemas.js';

// Requests --------------------------------------------------------------------

/** One chunk of games for a worker to replay. */
export interface ValidationRequest {
	chunkId: number;
	/** `index` is 1-based, as the page displays it. */
	games: { index: number; icn: string }[];
}

// Responses -------------------------------------------------------------------

/** Messages posted back to the page. */
export type ValidationResponse =
	/** How many more games have been replayed since the last progress message. */
	| { type: 'progress'; chunkId: number; count: number }
	/** The chunk is finished, and these are its tallies. */
	| { type: 'done'; chunkId: number; results: ChunkResults };

/** One worker's tallies for its whole chunk. */
export interface ChunkResults {
	successfulCount: number;
	icnconverterErrors: number;
	formulatorErrors: number;
	illegalMoveErrors: number;
	terminationMismatchErrors: number;
	errors: ValidationError[];
	variantErrors: Record<string, VariantStats>;
}

/** The stage a game failed at. Doubles as the error item's CSS class on the page. */
type ValidationPhase =
	| 'icnconverter'
	| 'formulator'
	| 'illegal-move'
	| 'termination-mismatch'
	| 'unknown';

/** One game that failed, and where it failed. */
export interface ValidationError {
	gameIndex: number;
	phase: ValidationPhase;
	error: string;
	icn: string;
	variant?: string;
	termination?: string;
	result?: string;
	gameConclusion?: GameConclusion;
}

/** The failure tallies of a single variant, one per phase that can fail. */
interface VariantErrorCounts {
	icn: number;
	formulator: number;
	illegal: number;
	termination: number;
}

/** Which tally a single failure counts towards. */
export type VariantErrorType = keyof VariantErrorCounts;

/** A variant's failure tallies, plus their sum. */
export interface VariantStats extends VariantErrorCounts {
	total: number;
}
