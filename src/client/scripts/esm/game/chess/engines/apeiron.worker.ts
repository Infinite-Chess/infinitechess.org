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

import type { EngineWasmModule, WasmEngine, WasmMove } from './enginewasm.js';
import type {
	ApeironMoveRequest,
	EngineInitRequest,
	EngineInitResponse,
	EngineResponse,
} from './engineprotocol.js';

import jsutil from '../../../../../../shared/util/jsutil.js';

import engineicn from './engineicn.js';
import enginewasm from './enginewasm.js';

// Types -----------------------------------------------------------------------

/** The gameplay engine glue's exports. */
interface GameplayWasmModule extends EngineWasmModule {
	Engine: {
		/** Constructs an engine at the position described by `icn`, with the search config. */
		from_icn: (icn: string, config: Record<string, number>) => GameplayEngine;
	};
}

/** One wasm engine instance, bound to the position it was constructed at. */
interface GameplayEngine extends WasmEngine {
	/**
	 * Searches for the best move, bounded by `timeLimit` ms, optionally consulting
	 * the opening book. Null when the search produced no move.
	 */
	get_best_move_with_time: (timeLimit: number, useBook: boolean) => WasmMove | null;
}

// State -----------------------------------------------------------------------

let wasm: GameplayWasmModule;

// Message Handling ------------------------------------------------------------

self.onmessage = async function (
	e: MessageEvent<EngineInitRequest | ApeironMoveRequest>,
): Promise<void> {
	// The first message carries the engine-glue URL + thread count.
	if ('engineUrl' in e.data) return initWasm(e.data);
	respondToMoveRequest(e.data);
};

/**
 * Initializes the WASM module from the served glue, bringing up the
 * Lazy SMP thread pool when supported, then posts 'readyok'.
 */
async function initWasm(msg: EngineInitRequest): Promise<void> {
	try {
		console.debug('[Engine] Initializing Apeiron WASM module');
		({ wasm } = await enginewasm.load<GameplayWasmModule>(msg.engineUrl, msg.threads));

		console.debug('[Engine] Apeiron WASM module initialized');
		postMessage('readyok' satisfies EngineInitResponse);
	} catch (err: unknown) {
		console.error('[Engine] Failed to initialize Apeiron WASM module', err);
		postMessage({
			type: 'initerror',
			message: jsutil.getErrorMessage(err),
		} satisfies EngineInitResponse);
		self.close();
	}
}

/**
 * Constructs an engine at the requested position, then posts back either its generated
 * legal moves (debug) or the best move it finds, as a compact ICN token. Any failure
 * posts a null move, which the page treats as the engine resigning.
 */
function respondToMoveRequest(data: ApeironMoveRequest): void {
	let engine: GameplayEngine | undefined;
	try {
		const engineColor = data.youAreColor;

		// Convert compressed gamefile (lf) to ICN string
		const icnString = engineicn.serialize(data.lf);

		// Initialize engine configuration
		const engineConfig = {
			strength_level: data.engineConfig.strengthLevel,
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
			postMessage({ type: 'generatedMoves', data: formattedMoves } satisfies EngineResponse);
			return;
		}

		const timeLimit = data.engineConfig.engineTimeLimitPerMoveMillis;
		const bestMoveResult = engine.get_best_move_with_time(timeLimit, true);

		if (!bestMoveResult) {
			console.error('[Engine] No best move result returned from WASM');
			postMessage({ type: 'move', data: null } satisfies EngineResponse);
			return;
		}

		// Format: "x,y>x,y" or "x,y>x,y=Q" (promotion)
		const from = bestMoveResult.from;
		const to = bestMoveResult.to;
		let moveString = `${from}>${to}`;
		if (bestMoveResult.promotion) {
			moveString += `=${enginewasm.getPromotionAbbr(bestMoveResult.promotion, engineColor)}`;
		}

		postMessage({ type: 'move', data: moveString } satisfies EngineResponse);
	} catch (error) {
		console.error(`[Engine] Error finding best move:`, error);
		postMessage({ type: 'move', data: null } satisfies EngineResponse);
	} finally {
		engine?.free();
	}
}

/** Normalizes an optional clock value to whole, non-negative milliseconds. Absent = 0. */
function toClockMillis(value: number | undefined): number {
	return value === undefined ? 0 : Math.max(0, Math.round(value));
}

export {};
