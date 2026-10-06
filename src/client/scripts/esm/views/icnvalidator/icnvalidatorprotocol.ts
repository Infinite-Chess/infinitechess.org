// src/client/scripts/esm/views/icnvalidator/icnvalidatorprotocol.ts

/**
 * The ICN validator's data contract: the messages between the page and its
 * workers, and the games json it reads.
 */

import type { GameConclusion } from '../../../../../shared/chess/util/typeschemas.js';

import * as z from 'zod';

// Requests --------------------------------------------------------------------

/** One chunk of games for a worker to replay. */
export interface ValidationRequest {
	chunkId: number;
	/** `index` is 1-based, as the page displays it. */
	games: { index: number; icn: string }[];
	/** The engine glue to compare movegen against. Absent skips the movegen check. */
	engineUrl?: string;
}

// Responses -------------------------------------------------------------------

/** Messages posted back to the page. */
export type ValidationResponse =
	/** How many more games have been replayed since the last progress message. */
	| { type: 'progress'; chunkId: number; count: number }
	/** The chunk is finished, and these are its tallies. */
	| { type: 'done'; chunkId: number; results: ChunkResults }
	/** The engine failed to load, so the chunk wasn't validated. */
	| { type: 'initerror'; chunkId: number; message: string };

/** One chunk's tallies. */
export interface ChunkResults {
	successfulCount: number;
	icnconverterErrors: number;
	formulatorErrors: number;
	illegalMoveErrors: number;
	movegenMismatchErrors: number;
	terminationMismatchErrors: number;
	errors: ValidationError[];
	variantErrors: Record<string, VariantStats>;
	/** The sum, mod 2^32, of every position's move hash. 0 unless the fingerprint was requested. */
	fingerprint: number;
}

/** The stage a game failed at. Doubles as its `phase-*` CSS class on the page. */
export type ValidationPhase =
	| 'icnconverter'
	| 'formulator'
	| 'illegal-move'
	| 'movegen-mismatch'
	| 'termination-mismatch';

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
	movegen: number;
	termination: number;
}

/** Which tally a single failure counts towards. */
export type VariantErrorType = keyof VariantErrorCounts;

/** A variant's failure tallies, plus their sum. */
export interface VariantStats extends VariantErrorCounts {
	total: number;
}

// Schemas ---------------------------------------------------------------------

/** The games json an SPRT run writes: one ICN per game. */
export const SPRTGamesSchema = z.array(z.string()).min(1);
