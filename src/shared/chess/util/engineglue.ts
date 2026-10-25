// src/shared/chess/util/engineglue.ts

/**
 * The shape of the engine's wasm glue, which every engine worker, client and server, loads at
 * runtime and casts to these types, and the refusals it throws. Declared once, so when an engine
 * update changes it, fixing these for one caller breaks the compile of every other caller relying
 * on what changed.
 *
 * Refusals live here, not in apeironcard.ts, so workers decode them without bundling its board
 * and rules code (7× the analysis worker's size).
 */

// Types -----------------------------------------------------------------------

/** Why the engine refused a position it was handed, which only it can tell. */
export type EngineRefusal = (typeof ENGINE_REFUSALS)[number];

/** The exports every engine glue module provides. */
export interface EngineWasmModule {
	/** wasm-bindgen's init. Compiles and instantiates the .wasm alongside the glue, unless handed its bytes. */
	default: (init?: { module_or_path: BufferSource }) => Promise<EngineWasmInitOutput>;
	/** Starts the rayon thread pool. Absent on single-threaded engine builds. */
	initThreadPool?: (threads: number) => Promise<void>;
}

/** What a glue module's init hands back. */
export interface EngineWasmInitOutput {
	/** The instance's linear memory, shared when the build is multithreaded. */
	memory: WebAssembly.Memory;
}

/** What every engine instance exposes, whatever the build. */
export interface WasmEngine {
	/** Every legal move in the position. */
	get_legal_moves_js: () => WasmMove[];
	/** Releases the wasm-side allocation. Mandatory — wasm memory isn't GC'd. */
	free: () => void;
}

/** A move as wasm reports it: `from`/`to` are compact ICN coords ("x,y"). */
export interface WasmMove {
	from: string;
	to: string;
	/** The engine's own single-letter piece code, NOT a site abbreviation. */
	promotion?: string | null;
}

// --- Analysis ---

/** The analysis glue's exports: streaming MultiPV searches over a sequence of positions. */
export interface AnalysisWasmModule extends EngineWasmModule {
	Engine: {
		/** Constructs an engine at the position described by `icn`. Throws its refusal's name for one it can't take. */
		from_icn: (icn: string, config: Record<string, never>) => AnalysisWasmEngine;
	};
	/** Sizes the transposition table, in megabytes. Must be called before any search. */
	set_hash_size: (hashMb: number) => void;
	/** Byte offset of the shared stop flag, which a page writes to abort a search. */
	stop_flag_ptr: () => number;
	/** Parks the Lazy SMP helper threads once a position is finished. */
	stop_analysis_helpers: () => void;
	/** Clears the transposition table and all other cross-position search state. */
	reset_engine_state: () => void;
}

/** One analysis engine instance, holding the position it is searching. */
export interface AnalysisWasmEngine extends WasmEngine {
	/** Moves the instance to a new position, keeping the warm transposition table. Throws like `from_icn`. */
	set_position: (icn: string) => void;
	/**
	 * Runs iterative deepening from `start_depth` toward `max_depth` (default 64), invoking
	 * `onInfo` after each completed depth and returning the final one. Blocks until it finishes,
	 * exhausts `slice_ms` (0 = unbounded) or `max_nodes`, or the shared stop flag is written.
	 */
	analyse: (
		options: {
			multi_pv: number;
			max_depth?: number;
			start_depth: number;
			slice_ms: number;
			max_nodes?: number;
		},
		onInfo: (info: AnalysisInfo) => void,
	) => AnalysisInfo | null;
}

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

// --- Gameplay ---

/** The gameplay glue's exports: one best move per position. */
export interface GameplayWasmModule extends EngineWasmModule {
	Engine: {
		/** Constructs an engine at the position described by `icn`, with the search config. */
		from_icn: (icn: string, config: Record<string, number>) => GameplayWasmEngine;
	};
}

/** One gameplay engine instance, bound to the position it was constructed at. */
export interface GameplayWasmEngine extends WasmEngine {
	/**
	 * Searches for the best move, bounded by `timeLimit` ms; `silent` skips the search's
	 * console logging. Null when the search produced no move.
	 */
	get_best_move_with_time: (timeLimit: number, silent: boolean) => WasmMove | null;
}

// Constants -------------------------------------------------------------------

/** The engine's own refusals: pieces too far apart to bring within its coordinates. */
const ENGINE_REFUSALS = ['too_spread_out'] as const;

// Functions -------------------------------------------------------------------

/**
 * The engine's refusal of a position, which it throws as the name of its `compression::Refusal`,
 * else undefined.
 */
function asRefusal(e: unknown): EngineRefusal | undefined {
	if (e === 'Uncompressible') return 'too_spread_out';
	return undefined;
}

// Exports ---------------------------------------------------------------------

export default {
	// Constants
	ENGINE_REFUSALS,
	// Functions
	asRefusal,
};
