// src/client/scripts/esm/views/analysis/analysisprotocol.ts

/**
 * The message protocol between the analysis page and its engine workers.
 *
 * The gameplay engines speak a separate protocol, declared in engineprotocol.ts.
 *
 * `EvaluateResultSchema` brings zod, since reviews are also restored from LocalStorage.
 * Workers bundle separately and stay zod-free only while importing from here `import type`.
 */

import type { Player } from '../../../../../shared/chess/util/typeutil.js';

import * as z from 'zod';

// Requests --------------------------------------------------------------------

/** Messages accepted by an analysis worker. */
export type AnalysisCommand =
	/**
	 * `engineUrl` is the served glue path (from the manifest). `threads` > 1 spins up
	 * the Lazy SMP pool (the search worker); omit it for the idle legal-moves helper
	 * and game-review workers, which search single-threaded.
	 */
	| { cmd: 'init'; hashMb: number; engineUrl: string; threads?: number }
	/**
	 * The position to analyze. `newGame` drops the persistent searcher and its TT;
	 * `resetSearch` restarts iterative deepening without discarding the TT.
	 */
	| { cmd: 'position'; icn: string; newGame?: boolean; resetSearch?: boolean }
	/** Start (or re-target) the search loop on the current position. */
	| { cmd: 'go'; opts: GoOptions }
	/** One-shot legal-move enumeration, for the debug move overlay. */
	| { cmd: 'legalmoves'; requestId: number; icn: string }
	/** One-shot position evaluation to a fixed depth, for the game review. */
	| {
			cmd: 'evaluate';
			requestId: number;
			icn: string;
			maxDepth: number;
			/** Side to move, needed to case a forced move's promotion abbreviation. */
			mover: Player;
			newChunk?: boolean;
			warmup?: boolean;
	  }
	/** Abort the in-flight search and stop the loop. */
	| { cmd: 'stop' };

/** Search limits/settings for a `go` command. */
export interface GoOptions {
	/** How many principal variations to search in parallel. */
	multiPv: number;
	/** Target depth to analyze to, then stop. */
	maxDepth: number;
	/** Main-thread analysis request id. Echoed on all search responses. */
	requestId: number;
}

// Responses -------------------------------------------------------------------

/** Messages posted back to the main thread. */
export type AnalysisResponse =
	/** `mt` is whether this engine build supports Lazy SMP (exports `initThreadPool`). */
	| { type: 'ready'; mt: boolean }
	/** The wasm module failed to load; this worker is unusable. */
	| { type: 'initerror'; message: string }
	/** The wasm shared memory + byte offset of the stop flag, for instant search abort from the page. */
	| { type: 'sharedmem'; buffer: ArrayBufferLike; stopFlagPtr: number }
	/** One completed depth of the ongoing search. */
	| { type: 'info'; requestId: number; info: AnalysisInfo }
	/** Compact move tokens ("x,y>x,y") answering a `legalmoves` command. */
	| { type: 'legalmoves'; requestId: number; moves: string[] }
	/** A finished `evaluate` command. */
	| ({ type: 'evaluated' } & EvaluateResult)
	/** The position is fully analyzed; `info` is the final summary. */
	| {
			type: 'done';
			requestId: number;
			reason: 'depth' | 'mate' | 'terminal';
			info: AnalysisInfo;
	  }
	/** The search threw (likely a wasm panic, which poisons the module) — the main thread must respawn the worker. */
	| { type: 'searcherror'; message: string };

/** A streamed engine info update (one per completed depth). */
export interface AnalysisInfo {
	depth: number;
	/** Deepest ply reached by any line, including quiescence extensions. */
	seldepth: number;
	nodes: number;
	nps: number;
	timeMs: number;
	/** TT fill in permille (0-1000). */
	hashfull: number;
	lines: AnalysisLine[];
}

/** One PV of an info update. Moves are compact ICN tokens ("x,y>x,y=Q"). */
interface AnalysisLine {
	moves: string[];
	/** Centipawns from the side-to-move's perspective. Absent when mating. */
	cp?: number;
	/** Full moves to mate from the side-to-move's perspective (negative = getting mated). */
	mate?: number;
}

// Schemas ---------------------------------------------------------------------

/** The result of a one-shot `evaluate` command (see {@link EvaluateResultSchema}). */
export type EvaluateResult = z.infer<typeof EvaluateResultSchema>;
/**
 * The result of a one-shot `evaluate` command, and the source of truth for the
 * {@link EvaluateResult} type. Score is from the side-to-move's perspective; both
 * absent on a terminal position (no legal moves).
 */
export const EvaluateResultSchema = z.strictObject({
	requestId: z.int(),
	/** Centipawns. Absent when mating or terminal. */
	cp: z.number().optional(),
	/** Full moves to mate (negative = getting mated). */
	mate: z.number().optional(),
	/** The engine's best line as compact move tokens ("x,y>x,y=Q"). Absent on terminal positions. */
	pv: z.array(z.string()).optional(),
	/** 0 = terminal (checkmate/stalemate), 1 = forced move (not searched). */
	legalMoveCount: z.int(),
	/** Whether the side to move is in check (distinguishes checkmate from stalemate when terminal). */
	inCheck: z.boolean(),
	/** The deepest depth the search completed (0 for terminal/forced/unevaluated positions). */
	depth: z.int(),
	/** Echoed for an unreported TT-warming search. */
	warmup: z.boolean().optional(),
});
