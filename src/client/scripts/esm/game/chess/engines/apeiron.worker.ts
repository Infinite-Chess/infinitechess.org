// src/client/scripts/esm/game/chess/engines/apeiron.worker.ts

/**
 * Apeiron Engine
 * A JavaScript wrapper for the WASM implementation of Apeiron
 *
 * The engine glue is served UNBUNDLED at a content-versioned `/engine/<hash>/` path (see
 * build/engine-wasm.ts) and loaded via a runtime dynamic import whose URL arrives in the
 * init message — the same mechanism as the analysis worker. wasm-bindgen-rayon self-spawns
 * its Lazy SMP threads by resolving the glue's own `import.meta.url`, which only works when
 * the glue (and its `snippets/` + .wasm) are real served files; bundling them here breaks it.
 *
 * @author FirePlank
 */

import icnconverter, {
	LongFormatIn,
} from '../../../../../../shared/chess/logic/icn/icnconverter.js';
import type { EngineWasmModule } from './enginewasm.js';

import { loadEngineWasm } from './enginewasm.js';

interface GameplayEngine {
	get_legal_moves_js: () => WasmBestMoveResult[];
	get_best_move_with_time: (timeLimit: number, useBook: boolean) => WasmBestMoveResult | null;
	free: () => void;
}

interface GameplayWasmModule extends EngineWasmModule {
	Engine: {
		from_icn: (icn: string, config: Record<string, number>) => GameplayEngine;
	};
}

let wasm: GameplayWasmModule;

interface EngineConfig {
	engineTimeLimitPerMoveMillis?: number;
	strengthLevel?: number;
}

/** The first message from the page: where to load the engine glue, and the Lazy SMP pool size. */
interface EngineWorkerInitMessage {
	/** Served engine-glue URL (from the asset manifest). */
	engineUrl: string;
	/** Lazy SMP search threads (1 = single-threaded). */
	threads: number;
}

interface EngineWorkerMessage {
	stringGamefile: string;
	lf: LongFormatIn;
	engineConfig?: EngineConfig;
	youAreColor: number;
	wtime?: number;
	btime?: number;
	winc?: number;
	binc?: number;
	requestGeneratedMoves?: boolean;
}

interface WasmBestMoveResult {
	from: string;
	to: string;
	promotion?: string | null;
}

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

// Main entry point for the engine
self.onmessage = async function (
	e: MessageEvent<EngineWorkerInitMessage | EngineWorkerMessage>,
): Promise<void> {
	// The first message carries the engine-glue URL + thread count.
	if ('engineUrl' in e.data) return initWasm(e.data);

	const data = e.data;

	try {
		const engineColor = data.youAreColor;

		// Convert compressed gamefile (lf) to ICN string
		const icnString = icnconverter.LongToShort_Format(
			data.lf,
			icnconverter.COMPACT_FORMAT_OPTIONS,
		);

		// Initialize engine configuration
		const engineConfig = {
			strength_level: data.engineConfig?.strengthLevel ?? 3,
			wtime: toClockMillis(data.wtime),
			btime: toClockMillis(data.btime),
			winc: toClockMillis(data.winc),
			binc: toClockMillis(data.binc),
		};

		let engine: GameplayEngine;
		try {
			engine = wasm.Engine.from_icn(icnString, engineConfig);
		} catch (e) {
			console.error('[Engine] Failed to start engine from ICN:', e);
			postMessage({ type: 'move', data: null });
			return;
		}

		// Send generated moves for debugging if requested
		if (data.requestGeneratedMoves === true) {
			const legalMoves: WasmBestMoveResult[] = engine.get_legal_moves_js();
			const formattedMoves: string[] = legalMoves.map((m) => `${m.from}>${m.to}`);
			// Send the generated moves back to the main thread for rendering
			postMessage({ type: 'generatedMoves', data: formattedMoves });
			engine.free();
			return;
		}

		const timeLimit = data.engineConfig?.engineTimeLimitPerMoveMillis ?? 0;
		const bestMoveResult = engine.get_best_move_with_time(timeLimit, true);
		engine.free();

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
			const promoAbbr = mapRustPromotionToSiteAbbr(bestMoveResult.promotion, engineColor);
			moveString += `=${promoAbbr}`;
		}

		postMessage({ type: 'move', data: moveString });
	} catch (error) {
		console.error(`[Engine] Error finding best move:`, error);
		postMessage({ type: 'move', data: null });
	}
};

function toClockMillis(value: number | undefined): number {
	return value === undefined ? 0 : Math.max(0, Math.round(value));
}

function mapRustPromotionToSiteAbbr(
	promotion: string | null | undefined,
	engineColor: number,
): string {
	const code = String(promotion ?? '').toLowerCase();
	const isWhite = engineColor === 1;
	const map: Record<string, { w: string; b: string }> = {
		q: { w: 'Q', b: 'q' },
		r: { w: 'R', b: 'r' },
		b: { w: 'B', b: 'b' },
		n: { w: 'N', b: 'n' },
		m: { w: 'AM', b: 'am' },
		h: { w: 'HA', b: 'ha' },
		c: { w: 'CH', b: 'ch' },
		a: { w: 'AR', b: 'ar' },
		e: { w: 'CE', b: 'ce' },
		g: { w: 'GU', b: 'gu' },
		l: { w: 'CA', b: 'ca' },
		i: { w: 'GI', b: 'gi' },
		z: { w: 'ZE', b: 'ze' },
		y: { w: 'RQ', b: 'rq' },
		d: { w: 'RC', b: 'rc' },
		s: { w: 'NR', b: 'nr' },
		u: { w: 'HU', b: 'hu' },
		o: { w: 'RO', b: 'ro' },
		k: { w: 'K', b: 'k' },
		p: { w: 'P', b: 'p' },
	};
	const entry = map[code];
	if (!entry) return isWhite ? 'Q' : 'q';
	return isWhite ? entry.w : entry.b;
}

export {};
