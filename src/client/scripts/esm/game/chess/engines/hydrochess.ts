// src/client/scripts/esm/game/chess/engines/hydrochess.ts

/**
 * HydroChess Engine
 * A JavaScript wrapper for the WASM implementation of HydroChess
 *
 * @author FirePlank
 */

import icnconverter, {
	LongFormatIn,
} from '../../../../../../shared/chess/logic/icn/icnconverter.js';

// @ts-ignore without this, the type check job fails
import wasmUrl from '../../../../../pkg/hydrochess/pkg/hydrochess_wasm_bg.wasm';
// @ts-ignore without this, the type check job fails
import init, * as wasmBindings from '../../../../../pkg/hydrochess/pkg/hydrochess_wasm.js';

const wasm = wasmBindings as typeof wasmBindings;
let wasmInitialized = false;
let wasmInitPromise: Promise<boolean> | null = null;

interface EngineConfig {
	engineTimeLimitPerMoveMillis?: number;
	strengthLevel?: number;
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

// Initializes the WASM module.
// @returns Promise that resolves when the WASM module is initialized
async function initWasm(): Promise<boolean> {
	if (!wasmInitPromise) {
		console.debug('[Engine] Initializing HydroChess WASM module');
		wasmInitPromise = init({ module_or_path: wasmUrl })
			.then(async () => {
				console.debug('[Engine] HydroChess WASM module initialized');
				wasmInitialized = true;

				postMessage('readyok');
				return true;
			})
			.catch((err: unknown) => {
				console.error('[Engine] Failed to initialize HydroChess WASM module', err);
				wasmInitialized = false;
				return false;
			});
	}
	return wasmInitPromise!;
}

// Initialize WASM when the module is loaded
void initWasm();

// Main entry point for the engine
self.onmessage = async function (e: MessageEvent<EngineWorkerMessage>): Promise<void> {
	const data = e.data;

	// Ensure WASM is initialized before processing commands
	if (!wasmInitialized) {
		const initialized = await initWasm();
		if (!initialized) {
			console.error('[Engine] WASM module failed to initialize');
			postMessage({ type: 'move', data: null });
			return;
		}
	}

	try {
		const engineColor = data.youAreColor;

		// Convert compressed gamefile (lf) to ICN string
		const icnString = icnconverter.LongToShort_Format(data.lf, {
			compact: true,
			skipPosition: false,
			spaces: false,
			comments: false,
			make_new_lines: false,
			move_numbers: false,
		});

		// Initialize engine configuration
		const engineConfig = {
			strength_level: data.engineConfig?.strengthLevel ?? 3,
			wtime: data.wtime ?? 0,
			btime: data.btime ?? 0,
			winc: data.winc ?? 0,
			binc: data.binc ?? 0,
		};

		let engine;
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
			postMessage({ type: 'generatedMoves', data: formattedMoves });
			engine.free();
			return;
		}

		const timeLimit = data.engineConfig?.engineTimeLimitPerMoveMillis ?? 0;
		let bestMoveResult = engine.get_best_move_with_time(timeLimit, true);
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
