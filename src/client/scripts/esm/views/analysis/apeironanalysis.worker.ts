// src/client/scripts/esm/views/analysis/apeironanalysis.worker.ts

/**
 * Apeiron Analysis Worker
 *
 * Persistent-session engine worker for the analysis board. Unlike the gameplay
 * worker (apeiron.worker.ts), which answers one best-move request per message, this
 * runs an ongoing MultiPV search of the current position and streams UCI-like
 * info updates back to the main thread after every completed depth.
 *
 * Each search runs unbounded toward its target depth, blocking the worker thread.
 * Responsiveness comes not from time-slicing but from the shared stop flag: the page
 * writes it to abort the in-flight search, letting a queued position/settings/stop
 * command be processed before the loop re-searches the new desired state.
 *
 * Multithreaded (Lazy SMP) build: `initThreadPool` spins up helper search threads, and
 * the page can abort an in-flight search instantly by writing the shared stop flag (posted
 * back as {@link AnalysisResponse} 'sharedmem') — so switching positions never discards the
 * warm transposition table. Requires the page to be cross-origin isolated (SharedArrayBuffer).
 *
 * The engine glue is served UNBUNDLED at a content-versioned `/engine/<hash>/` path (see
 * build/engine-wasm.ts) and loaded via a runtime dynamic import — NOT a static import. Its URL
 * arrives in the 'init' message (the page reads it from the asset manifest). wasm-bindgen-rayon
 * self-spawns its Lazy SMP threads by resolving the glue's own `import.meta.url`, which only works
 * when the glue (and its `snippets/` + .wasm) are real served files; bundling them here breaks it.
 */

import type { Player } from '../../../../../shared/util/typeutil.js';
import type { EvaluateResult } from './gamereview.js';
import type {
	EngineWasmModule,
	WasmEngine,
	WasmMove,
} from '../../game/chess/engines/enginewasm.js';

import jsutil from '../../../../../shared/util/jsutil.js';

import { loadEngineWasm, getPromotionAbbr } from '../../game/chess/engines/enginewasm.js';

// Types ------------------------------------------------------------------------

/** Messages accepted by this worker. */
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
export interface AnalysisLine {
	moves: string[];
	/** Centipawns from the side-to-move's perspective. Absent when mating. */
	cp?: number;
	/** Full moves to mate from the side-to-move's perspective (negative = getting mated). */
	mate?: number;
}

/** The analysis engine glue's exports. */
interface AnalysisWasmModule extends EngineWasmModule {
	Engine: {
		/** Constructs an engine at the position described by `icn`. */
		from_icn: (icn: string, config: Record<string, never>) => AnalysisWasmEngine;
	};
	/** Sizes the transposition table, in megabytes. Must be called before any search. */
	set_hash_size: (hashMb: number) => void;
	/** Byte offset of the shared stop flag, which the page writes to abort a search. */
	stop_flag_ptr: () => number;
	/** Parks the Lazy SMP helper threads once a position is finished. */
	stop_analysis_helpers: () => void;
	/** Clears the transposition table and all other cross-position search state. */
	reset_engine_state: () => void;
}

/** One wasm engine instance, holding the position it is searching. */
interface AnalysisWasmEngine extends WasmEngine {
	/** Moves the instance to a new position, keeping the warm transposition table. */
	set_position: (icn: string) => void;
	is_in_check: () => boolean;
	/**
	 * Runs iterative deepening from `start_depth` toward `max_depth`, invoking `onInfo` after
	 * each completed depth and returning the final one. Blocks until it finishes, exhausts
	 * `slice_ms` (0 = unbounded), or the page writes the shared stop flag.
	 */
	analyse: (
		options: {
			multi_pv: number;
			max_depth: number;
			start_depth: number;
			slice_ms: number;
		},
		onInfo: (info: AnalysisInfo) => void,
	) => AnalysisInfo | null;
}

// Constants --------------------------------------------------------------------

/**
 * Wall-clock budget per engine call; 0 = unbounded (run to maxDepth in ONE call). The page
 * aborts an in-flight call instantly via the shared stop flag, so slicing isn't needed.
 */
const SLICE_MS = 0;

// State ------------------------------------------------------------------------

let wasm: AnalysisWasmModule;
/** Whether {@link wasm} has finished loading and is safe to call into. */
let wasmReady = false;

/** Persistent searcher for the ongoing analysis of {@link currentIcn}. */
let engine: AnalysisWasmEngine | undefined;
/** Persistent searcher for adjacent reverse-ordered Game Review positions. */
let evaluationEngine: AnalysisWasmEngine | undefined;

/** Bumped whenever the desired analysis (position/settings) changes; in-flight slice results with an older generation are dropped. */
let generation = 0;
/** Whether a search loop should currently be running. */
let analysing = false;
/** Whether the search loop *is* running (guards double-starts). */
let loopRunning = false;

/** The position the page wants analyzed. */
let currentIcn: string | undefined;
/** The ICN the engine was last given. */
let appliedIcn: string | undefined;
/** Settings from the most recent `go` command. */
let goOptions: GoOptions = { multiPv: 1, maxDepth: 13, requestId: 0 };
/**
 * Deepest iterative-deepening depth completed for the CURRENT position (reset when the
 * position changes). Each slice resumes at `reachedDepth + 1`, so the search keeps
 * deepening across slices instead of re-walking from depth 1 every time.
 */
let reachedDepth = 0;

// Init -----------------------------------------------------------------------------

/**
 * Loads the wasm module from the served glue, sizes its hash, brings up the Lazy SMP
 * pool when this is the search worker, then posts 'ready'.
 */
async function init(msg: Extract<AnalysisCommand, { cmd: 'init' }>): Promise<void> {
	try {
		const loaded = await loadEngineWasm<AnalysisWasmModule>(
			msg.engineUrl,
			msg.threads ?? 1,
			(module) => module.set_hash_size(msg.hashMb),
		);
		wasm = loaded.wasm;
		const { output, multithreaded: engineIsMultithreaded } = loaded;

		// Hand the page the shared stop flag, letting it abort an in-flight search instantly (the
		// search polls the flag every node batch, even single-threaded). Only a shared-memory
		// (multithreaded) engine build exposes wasm memory the page can write into.
		if (engineIsMultithreaded) {
			postMessage({
				type: 'sharedmem',
				buffer: output.memory.buffer,
				stopFlagPtr: wasm.stop_flag_ptr(),
			} satisfies AnalysisResponse);
		}

		wasmReady = true;
		postMessage({
			type: 'ready',
			mt: engineIsMultithreaded,
		} satisfies AnalysisResponse);
	} catch (e) {
		console.error('[Analysis Engine] Failed to initialize wasm', e);
		postMessage({
			type: 'initerror',
			message: jsutil.getErrorMessage(e),
		} satisfies AnalysisResponse);
	}
}

// Message Handling ---------------------------------------------------------------

self.onmessage = (e: MessageEvent<AnalysisCommand>): void => {
	const msg = e.data;
	switch (msg.cmd) {
		case 'init':
			void init(msg);
			break;
		case 'position':
			currentIcn = msg.icn;
			generation++;
			if (msg.resetSearch) {
				appliedIcn = undefined;
				reachedDepth = 0;
			}
			if (msg.newGame && wasmReady) {
				// Brand-new game: drop the persistent searcher & TT so stale entries
				// from an unrelated position can't pollute the analysis.
				wasm.reset_engine_state();
				engine?.free();
				engine = undefined;
				evaluationEngine?.free();
				evaluationEngine = undefined;
				appliedIcn = undefined;
			}
			break;
		case 'go':
			goOptions = msg.opts;
			generation++;
			analysing = true;
			void runLoop();
			break;
		case 'legalmoves':
			postLegalMoves(msg.requestId, msg.icn);
			break;
		case 'evaluate':
			postEvaluation(msg);
			break;
		case 'stop':
			generation++;
			analysing = false;
			if (wasmReady) wasm.stop_analysis_helpers();
			break;
	}
};

// Search loop ------------------------------------------------------------------------

/**
 * The ongoing analysis loop: each engine call runs unbounded ({@link SLICE_MS} = 0) toward the
 * target depth, streaming every completed depth, and returns on completion or when the page
 * writes the shared stop flag. The loop then yields so queued stop/position/go commands are
 * honored before it finishes or re-searches the new desired position.
 */
async function runLoop(): Promise<void> {
	if (loopRunning) return;
	loopRunning = true;
	try {
		while (analysing) {
			syncPosition();
			const gen = generation;
			const opts = goOptions;
			const requestId = opts.requestId;

			// One unbounded call: resume at the next depth and search toward the target,
			// streaming each completed depth via the callback. It returns on completion or
			// when the page writes the shared stop flag.
			const startDepth = Math.min(reachedDepth + 1, opts.maxDepth);

			const summary: AnalysisInfo | null = engine!.analyse(
				{
					multi_pv: opts.multiPv,
					max_depth: opts.maxDepth,
					start_depth: startDepth,
					slice_ms: SLICE_MS,
				},
				(info: AnalysisInfo) => {
					reachedDepth = Math.max(reachedDepth, info.depth);
					postMessage({ type: 'info', requestId, info } satisfies AnalysisResponse);
				},
			);

			// Let queued messages (stop / position / go) process before deciding
			// anything from this slice's result.
			await yieldToMessageQueue();

			// Superseded (new position/settings/stop): just loop; the while-condition
			// and syncPosition pick up the new desired state.
			if (gen !== generation) continue;

			if (summary) reachedDepth = Math.max(reachedDepth, summary.depth);

			// Decide whether the analysis of this position is finished.
			let reason: Extract<AnalysisResponse, { type: 'done' }>['reason'] | undefined;
			if (!summary || summary.lines.length === 0) reason = 'terminal';
			else if (summary.lines.every((line) => line.mate !== undefined && line.mate !== null))
				reason = 'mate';
			else if (reachedDepth >= opts.maxDepth) reason = 'depth';

			if (reason !== undefined) {
				analysing = false;
				wasm.stop_analysis_helpers(); // Retire the Lazy SMP helpers; the position is finished.
				postMessage({
					type: 'done',
					requestId,
					reason,
					info: summary ?? { depth: 0, seldepth: 0, nodes: 0, nps: 0, timeMs: 0, hashfull: 0, lines: [] }, // prettier-ignore
				} satisfies AnalysisResponse);
				break;
			}
		}
	} catch (e) {
		// A throw here is almost always a Rust/wasm panic, which leaves the wasm module
		// in a poisoned state — every subsequent engine call would throw too. Tell the main
		// thread so it can terminate & respawn this worker (fresh wasm) rather than hang
		// forever waiting for an 'info'/'done' that will never come.
		console.error('[Analysis Engine] Search loop crashed', e);
		analysing = false;
		postMessage({
			type: 'searcherror',
			message: jsutil.getErrorMessage(e),
		} satisfies AnalysisResponse);
	} finally {
		loopRunning = false;
	}
}

/** Applies {@link currentIcn} to the engine if it isn't already. */
function syncPosition(): void {
	if (currentIcn === undefined || appliedIcn === currentIcn) return;
	if (!engine) {
		engine = wasm.Engine.from_icn(currentIcn, {});
	} else {
		engine.set_position(currentIcn);
	}
	appliedIcn = currentIcn;
	reachedDepth = 0; // New position: iterative deepening restarts from depth 1.
}

/** Yields one macrotask so queued messages (stop / position / go) are processed. */
function yieldToMessageQueue(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

// One-shot queries ---------------------------------------------------------------------

/**
 * Answers a one-shot `legalmoves` query: enumerates the legal moves for {@link icn}
 * via a throwaway engine and posts them back as compact move tokens ("x,y>x,y").
 * Independent of the ongoing search — used to drive the debug move overlay.
 */
function postLegalMoves(requestId: number, icn: string): void {
	if (!wasmReady) {
		postMessage({ type: 'legalmoves', requestId, moves: [] } satisfies AnalysisResponse);
		return;
	}

	let legalMoveEngine: AnalysisWasmEngine | undefined;
	try {
		legalMoveEngine = wasm.Engine.from_icn(icn, {});
		const legalMoves: WasmMove[] = legalMoveEngine.get_legal_moves_js();
		// Destinations only — the overlay highlights squares, so a promotion suffix would be dead
		// weight (and this ICN carries no gameRules, so the engine never reports one anyway).
		const moves = legalMoves.map((m) => `${m.from}>${m.to}`);
		postMessage({ type: 'legalmoves', requestId, moves } satisfies AnalysisResponse);
	} catch (e) {
		// A wasm throw here would otherwise leak the engine and hang the main thread's request
		// (no response ever posted). Reply empty so the debug overlay just shows nothing.
		console.error('[Analysis Engine] Legal-move enumeration failed', e);
		postMessage({ type: 'legalmoves', requestId, moves: [] } satisfies AnalysisResponse);
	} finally {
		legalMoveEngine?.free();
	}
}

/**
 * Searches one game-review position. Dedicated review workers receive adjacent positions
 * in reverse order and retain this persistent searcher's TT throughout a fishnet-style chunk.
 * The first unreported search in each chunk warms a freshly-cleared hash.
 */
function postEvaluation(msg: Extract<AnalysisCommand, { cmd: 'evaluate' }>): void {
	const result: EvaluateResult = {
		requestId: msg.requestId,
		legalMoveCount: 0,
		inCheck: false,
		depth: 0,
		...(msg.warmup && { warmup: true }),
	};

	try {
		if (msg.newChunk) {
			wasm.reset_engine_state();
			evaluationEngine?.free();
			evaluationEngine = undefined;
		}
		if (!evaluationEngine) evaluationEngine = wasm.Engine.from_icn(msg.icn, {});
		else evaluationEngine.set_position(msg.icn);

		const legalMoves: WasmMove[] = evaluationEngine.get_legal_moves_js();
		result.legalMoveCount = legalMoves.length;
		result.inCheck = evaluationEngine.is_in_check();

		if (legalMoves.length === 1) {
			// Forced move: don't search; the review carries the eval over from its neighbors.
			const move = legalMoves[0]!;
			const promotion = move.promotion
				? `=${getPromotionAbbr(move.promotion, msg.mover)}`
				: '';
			result.pv = [`${move.from}>${move.to}${promotion}`];
		} else if (legalMoves.length > 1) {
			// The same search call the analysis loop uses. Its return value is deliberately
			// discarded: the page scores the position from the deepest depth streamed here, so a
			// search that never returns (wedged past the engine's stop-flag poll, and killed by
			// gamereview's watchdog) still yields its best answer.
			evaluationEngine.analyse(
				{ multi_pv: 1, max_depth: msg.maxDepth, start_depth: 1, slice_ms: 0 },
				(info: AnalysisInfo) => {
					postMessage({ type: 'info', requestId: msg.requestId, info } satisfies AnalysisResponse); // prettier-ignore
				},
			);
		}
	} catch (e) {
		// Likely a wasm panic (poisoned module) — tell the page so it can respawn this worker.
		console.error('[Analysis Engine] Evaluate crashed', e);
		postMessage({
			type: 'searcherror',
			message: jsutil.getErrorMessage(e),
		} satisfies AnalysisResponse);
		return;
	}

	postMessage({ type: 'evaluated', ...result } satisfies AnalysisResponse);
}
