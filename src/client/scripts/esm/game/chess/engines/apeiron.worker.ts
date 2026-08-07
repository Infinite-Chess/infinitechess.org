// src/client/scripts/esm/game/chess/engines/apeiron.worker.ts

/**
 * Apeiron Engine
 * A JavaScript wrapper for the WASM implementation of Apeiron
 *
 * Answers one best-move request per message from the page (contrast the analysis
 * board's apeironanalysis.worker.ts, which holds a persistent streaming search).
 *
 * The engine glue is served UNBUNDLED at a content-versioned `/engine/<hash>/` path (see
 * build/engine-wasm.ts) and loaded via a runtime dynamic import whose URL arrives in the
 * init message — the same mechanism as the analysis worker. wasm-bindgen-rayon self-spawns
 * its Lazy SMP threads by resolving the glue's own `import.meta.url`, which only works when
 * the glue (and its `snippets/` + .wasm) are real served files; bundling them here breaks it.
 *
 * @author FirePlank
 */

import type { Player } from '../../../../../../shared/chess/util/typeutil.js';
import type { LongFormatIn } from '../../../../../../shared/chess/logic/icn/icnconverter.js';
import type { EngineWasmModule } from './enginewasm.js';

import icnconverter from '../../../../../../shared/chess/logic/icn/icnconverter.js';

import { loadEngineWasm, getPromotionAbbr } from './enginewasm.js';

// Types ----------------------------------------------------------------

/** The first message from the page: where to load the engine glue, and the Lazy SMP pool size. */
interface EngineWorkerInitMessage {
	/** Served engine-glue URL (from the asset manifest). */
	engineUrl: string;
	/** Lazy SMP search threads (1 = single-threaded). */
	threads: number;
}

/** Every message after the init one: search the given position and post a move back. */
interface EngineWorkerMessage {
	/** Serialized gamefile. Part of the shared engine-worker contract, but unread by Apeiron. */
	stringGamefile: string;
	/** The compressed position/game to search, converted to ICN before it reaches wasm. */
	lf: LongFormatIn;
	engineConfig?: EngineConfig;
	/** The color the engine is playing, which the returned move is cased for. */
	youAreColor: Player;
	/** UCI-style clock remaining, in ms. Absent in untimed games. */
	wtime?: number;
	btime?: number;
	/** UCI-style clock increment, in ms. Absent in untimed games. */
	winc?: number;
	binc?: number;
	/** Debug: post the position's generated legal moves instead of searching for a move. */
	requestGeneratedMoves?: boolean;
}

/** Search settings the page chose for this engine game. */
interface EngineConfig {
	/** Hard per-move thinking budget. */
	engineTimeLimitPerMoveMillis?: number;
	/** Engine strength preset. */
	strengthLevel?: number;
}

/** The gameplay engine glue's exports. */
interface GameplayWasmModule extends EngineWasmModule {
	Engine: {
		/** Constructs an engine at the position described by `icn`, with the search config. */
		from_icn: (icn: string, config: Record<string, number>) => GameplayEngine;
	};
}

/** One wasm engine instance, bound to the position it was constructed at. */
interface GameplayEngine {
	/** Every legal move in the position. Drives the debug move overlay. */
	get_legal_moves_js: () => WasmMove[];
	/**
	 * Searches for the best move, bounded by `timeLimit` ms, optionally consulting
	 * the opening book. Null when the search produced no move.
	 */
	get_best_move_with_time: (timeLimit: number, useBook: boolean) => WasmMove | null;
	/** Releases the wasm-side allocation. Mandatory — wasm memory isn't GC'd. */
	free: () => void;
}

/** A move as wasm reports it: `from`/`to` are compact ICN coords ("x,y"). */
interface WasmMove {
	from: string;
	to: string;
	/** The engine's own single-letter piece code, NOT a site abbreviation. */
	promotion?: string | null;
}

// Constants ------------------------------------------------------------

/** Strength used when the page doesn't specify one. */
const DEFAULT_STRENGTH_LEVEL = 3;

// State ----------------------------------------------------------------

let wasm: GameplayWasmModule;

// Message Handling -----------------------------------------------------

self.onmessage = async function (
	e: MessageEvent<EngineWorkerInitMessage | EngineWorkerMessage>,
): Promise<void> {
	// The first message carries the engine-glue URL + thread count.
	if ('engineUrl' in e.data) return initWasm(e.data);
	respondToMoveRequest(e.data);
};

/**
 * Initializes the WASM module from the served glue, bringing up the
 * Lazy SMP thread pool when supported, then posts 'readyok'.
 */
async function initWasm(msg: EngineWorkerInitMessage): Promise<void> {
	try {
		console.debug('[Engine] Initializing Apeiron WASM module');
		({ wasm } = await loadEngineWasm<GameplayWasmModule>(msg.engineUrl, msg.threads));

		console.debug('[Engine] Apeiron WASM module initialized');
		postMessage('readyok');
	} catch (err: unknown) {
		console.error('[Engine] Failed to initialize Apeiron WASM module', err);
		postMessage({
			type: 'initerror',
			message: err instanceof Error ? err.message : String(err),
		});
		self.close();
	}
}

/**
 * Constructs an engine at the requested position, then posts back either its generated
 * legal moves (debug) or the best move it finds, as a compact ICN token. Any failure
 * posts a null move, which the page treats as the engine resigning.
 */
function respondToMoveRequest(data: EngineWorkerMessage): void {
	let engine: GameplayEngine | undefined;
	try {
		const engineColor = data.youAreColor;

		// Convert compressed gamefile (lf) to ICN string
		const icnString = icnconverter.LongToShort_Format(
			data.lf,
			icnconverter.COMPACT_FORMAT_OPTIONS,
		);

		// Initialize engine configuration
		const engineConfig = {
			strength_level: data.engineConfig?.strengthLevel ?? DEFAULT_STRENGTH_LEVEL,
			wtime: toClockMillis(data.wtime),
			btime: toClockMillis(data.btime),
			winc: toClockMillis(data.winc),
			binc: toClockMillis(data.binc),
		};

		engine = wasm.Engine.from_icn(icnString, engineConfig);

		// Send generated moves for debugging if requested
		if (data.requestGeneratedMoves === true) {
			const legalMoves: WasmMove[] = engine.get_legal_moves_js();
			const formattedMoves: string[] = legalMoves.map((m) => `${m.from}>${m.to}`);
			// Send the generated moves back to the main thread for rendering
			postMessage({ type: 'generatedMoves', data: formattedMoves });
			return;
		}

		const timeLimit = data.engineConfig?.engineTimeLimitPerMoveMillis ?? 0;
		const bestMoveResult = engine.get_best_move_with_time(timeLimit, true);

		if (!bestMoveResult) {
			console.error('[Engine] No best move result returned from WASM');
			postMessage({ type: 'move', data: null });
			return;
		}

		// Format: "x,y>x,y" or "x,y>x,y=Q" (promotion)
		const from = bestMoveResult.from;
		const to = bestMoveResult.to;
		let moveString = `${from}>${to}`;
		if (bestMoveResult.promotion) {
			moveString += `=${getPromotionAbbr(bestMoveResult.promotion, engineColor)}`;
		}

		postMessage({ type: 'move', data: moveString });
	} catch (error) {
		console.error(`[Engine] Error finding best move:`, error);
		postMessage({ type: 'move', data: null });
	} finally {
		engine?.free();
	}
}

/** Normalizes an optional clock value to whole, non-negative milliseconds. Absent = 0. */
function toClockMillis(value: number | undefined): number {
	return value === undefined ? 0 : Math.max(0, Math.round(value));
}

export {};
