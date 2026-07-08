// src/client/scripts/esm/views/analysis/hydrochessanalysis.worker.ts

/**
 * HydroChess Analysis Worker
 *
 * Persistent-session engine worker for the analysis board. Unlike the gameplay
 * worker (hydrochess.ts) which answers one best-move request per message, this
 * runs an ongoing time-sliced MultiPV search of the current position and streams
 * UCI-like info updates back to the main thread after every completed depth.
 * Between slices it yields to the message queue, so position/settings/stop
 * commands stay responsive even though each search slice blocks the thread.
 *
 * Single-threaded only. (The engine also has a multithreaded build, but the site
 * doesn't wire it up currently — analysis is locked to one thread.)
 */

// @ts-ignore without this, the type check job fails
import wasmUrl from '../../../../pkg/hydrochess/pkg/hydrochess_wasm_bg.wasm';
// @ts-ignore without this, the type check job fails
import init, * as wasmBindings from '../../../../pkg/hydrochess/pkg/hydrochess_wasm.js';

// Protocol types --------------------------------------------------------------

/** One PV of an info update. Moves are compact ICN tokens ("x,y>x,y=Q"). */
interface AnalysisLine {
	moves: string[];
	/** Centipawns from the side-to-move's perspective. Absent when mating. */
	cp?: number;
	/** Full moves to mate from the side-to-move's perspective (negative = getting mated). */
	mate?: number;
}

/** A streamed engine info update (one per completed depth). */
interface AnalysisInfo {
	depth: number;
	seldepth: number;
	nodes: number;
	nps: number;
	timeMs: number;
	/** TT fill in permille (0-1000). */
	hashfull: number;
	lines: AnalysisLine[];
}

/** Search limits/settings for a `go` command. */
interface GoOptions {
	multiPv: number;
	/** Target depth to analyze to, then stop. */
	maxDepth: number;
	/** Main-thread analysis request id. Echoed on all search responses. */
	requestId: number;
}

/** Messages accepted by this worker. */
type AnalysisCommand =
	| { cmd: 'init'; hashMb: number }
	| { cmd: 'position'; icn: string; newGame?: boolean; resetSearch?: boolean }
	| { cmd: 'go'; opts: GoOptions }
	| { cmd: 'legalmoves'; requestId: number; icn: string }
	| { cmd: 'stop' };

/** Messages posted back to the main thread. */
type AnalysisResponse =
	| { type: 'ready' }
	| { type: 'initerror'; message: string }
	| { type: 'info'; requestId: number; info: AnalysisInfo }
	| { type: 'legalmoves'; requestId: number; moves: string[] }
	| {
			type: 'done';
			requestId: number;
			reason: 'depth' | 'mate' | 'terminal';
			info: AnalysisInfo;
	  };

export type { AnalysisCommand, AnalysisResponse, AnalysisInfo, AnalysisLine, GoOptions };

// State ------------------------------------------------------------------------

let engine: wasmBindings.Engine | undefined;
let wasmReady = false;

/**
 * Wall-clock budget per engine call. The engine runs continuous iterative deepening
 * (fast: each depth seeds the next), completing WHOLE depths and stopping once this
 * budget elapses — never mid-depth, so results stay deterministic. Each completed depth
 * is streamed to the UI as it finishes (even during the call). Between calls the loop
 * yields, so a new position/settings/stop command is honored within ~one slice — this
 * is what caps how long a superseded ("lingering") search keeps the engine busy.
 */
const SLICE_MS = 180;

/** Bumped whenever the desired analysis (position/settings) changes; in-flight slice results with an older generation are dropped. */
let generation = 0;
/** Whether a search loop should currently be running. */
let analysing = false;
/** Whether the search loop *is* running (guards double-starts). */
let loopRunning = false;

let currentIcn: string | undefined;
/** The ICN the engine was last given. */
let appliedIcn: string | undefined;
let goOptions: GoOptions = { multiPv: 1, maxDepth: 13, requestId: 0 };
/**
 * Deepest iterative-deepening depth completed for the CURRENT position (reset when the
 * position changes). Each slice resumes at `reachedDepth + 1`, so the search keeps
 * deepening across slices instead of re-walking from depth 1 every time.
 */
let reachedDepth = 0;

// Init ---------------------------------------------------------------------------

async function initialize(msg: Extract<AnalysisCommand, { cmd: 'init' }>): Promise<void> {
	try {
		await init({ module_or_path: wasmUrl });
		wasmBindings.set_hash_size(msg.hashMb);
		wasmReady = true;
		postMessage({ type: 'ready' } satisfies AnalysisResponse);
	} catch (e) {
		console.error('[Analysis Engine] Failed to initialize wasm', e);
		postMessage({
			type: 'initerror',
			message: e instanceof Error ? e.message : String(e),
		} satisfies AnalysisResponse);
	}
}

// Search loop ---------------------------------------------------------------------

/** Yields one macrotask so queued messages (stop / position / go) are processed. */
function yieldToMessageQueue(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Applies {@link currentIcn} to the engine if it isn't already. */
function syncPosition(): void {
	if (currentIcn === undefined || appliedIcn === currentIcn) return;
	if (!engine) {
		engine = wasmBindings.Engine.from_icn(currentIcn, {});
	} else {
		engine.set_position(currentIcn);
	}
	appliedIcn = currentIcn;
	reachedDepth = 0; // New position: iterative deepening restarts from depth 1.
}

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

	const legalMoveEngine = wasmBindings.Engine.from_icn(icn, {});
	const legalMoves: { from: string; to: string; promotion?: string | null }[] =
		legalMoveEngine.get_legal_moves_js();
	const moves = legalMoves.map((move) => {
		let token = `${move.from}>${move.to}`;
		if (move.promotion) token += `=${move.promotion}`;
		return token;
	});
	legalMoveEngine.free();
	postMessage({ type: 'legalmoves', requestId, moves } satisfies AnalysisResponse);
}

/**
 * The ongoing analysis loop. Each engine call searches EXACTLY ONE iterative-deepening
 * depth to completion, with no time limit — the search never aborts mid-depth, so
 * given the same position and settings the results are fully deterministic (a
 * wall-clock-based slice budget would cut the search at run-dependent points,
 * yielding different transposition-table states and thus different evals/moves
 * between runs). The loop yields to the message queue between depths, which is when
 * stop / position / settings commands are honored.
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

			// One time-sliced call: resume at the next depth and search toward the target,
			// completing as many whole depths as fit in SLICE_MS. Each depth streams via
			// the callback as it finishes.
			const startDepth = Math.min(reachedDepth + 1, opts.maxDepth);

			const summary: AnalysisInfo | null = engine!.analyse(
				{
					multi_pv: opts.multiPv,
					max_depth: opts.maxDepth,
					start_depth: startDepth,
					slice_ms: SLICE_MS,
				},
				(info: AnalysisInfo) => {
					if (gen !== generation) return;
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
			else if (summary.lines[0]!.mate !== undefined && summary.lines[0]!.mate !== null)
				reason = 'mate';
			else if (reachedDepth >= opts.maxDepth) reason = 'depth';

			if (reason !== undefined) {
				analysing = false;
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
		console.error('[Analysis Engine] Search loop crashed', e);
		analysing = false;
	} finally {
		loopRunning = false;
	}
}

// Message handling -----------------------------------------------------------------

self.onmessage = (e: MessageEvent<AnalysisCommand>): void => {
	const msg = e.data;
	switch (msg.cmd) {
		case 'init':
			void initialize(msg);
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
				wasmBindings.reset_engine_state();
				engine?.free();
				engine = undefined;
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
		case 'stop':
			generation++;
			analysing = false;
			break;
	}
};

export {};
