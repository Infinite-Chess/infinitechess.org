// src/client/scripts/esm/game/chess/engines/enginewasm.ts

/**
 * Loads an engine's wasm glue and shared-memory thread pool, and adapts the
 * engine's own piece codes to the site's ICN abbreviations.
 */

import type { Player, RawType } from '../../../../../../shared/util/typeutil.js';

import icnposition from '../../../../../../shared/chess/logic/icn/icnposition.js';
import typeutil, { rawTypes as r } from '../../../../../../shared/util/typeutil.js';

// Types -----------------------------------------------------------------------

/** The exports every engine glue module provides. */
export interface EngineWasmModule {
	/** wasm-bindgen's init. Compiles and instantiates the .wasm alongside the glue. */
	default: () => Promise<EngineWasmInitOutput>;
	/** Starts the rayon thread pool. Absent on single-threaded engine builds. */
	initThreadPool?: (threads: number) => Promise<void>;
}

/** What a glue module's init hands back. */
interface EngineWasmInitOutput {
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

// Wasm Loading ----------------------------------------------------------------

/** Hard cap on Lazy SMP threads used by engine features. */
const THREAD_CAP = 4;

/**
 * Whether this browser can run a multithreaded engine build. Requires cross-origin
 * isolation, without which wasm shared memory isn't backed by a SharedArrayBuffer.
 */
const BROWSER_SUPPORTS_THREADS: boolean = (() => {
	try {
		if (!globalThis.crossOriginIsolated) return false;
		if (typeof SharedArrayBuffer !== 'function' || typeof Atomics !== 'object') return false;
		if (typeof WebAssembly !== 'object') return false;
		const memory = new WebAssembly.Memory({ shared: true, initial: 1, maximum: 2 });
		return memory.buffer instanceof SharedArrayBuffer;
	} catch {
		return false;
	}
})();

/**
 * Loads the unbundled engine glue and initializes its optional thread pool.
 * `beforeThreadPool` runs after init but before the pool starts, for setup the
 * search threads must already see (e.g. hash size).
 */
async function loadEngineWasm<T extends EngineWasmModule>(
	engineUrl: string,
	threads: number,
	beforeThreadPool?: (wasm: T) => void,
): Promise<{ wasm: T; output: EngineWasmInitOutput; multithreaded: boolean }> {
	const glueUrl = new URL(engineUrl, self.location.origin).href;
	const wasm = (await import(glueUrl)) as T;
	const output = await wasm.default();
	beforeThreadPool?.(wasm);
	const multithreaded = typeof wasm.initThreadPool === 'function';
	if (threads > 1 && multithreaded) await wasm.initThreadPool!(threads);
	return { wasm, output, multithreaded };
}

/** Returns the usable hardware-thread count after an optional reservation. */
function maxEngineThreads(cap: number, reserve: number = 0): number {
	if (!BROWSER_SUPPORTS_THREADS) return 1;
	return Math.min(cap, Math.max(1, (navigator.hardwareConcurrency || 2) - reserve));
}

// Piece Codes -----------------------------------------------------------------

/**
 * Apeiron's own single-letter piece codes (its `PieceType::to_str()`, src/board.rs), which
 * it uses for the `promotion` field of the moves it hands back. They are arbitrary engine
 * identifiers — not derivable from the site's abbreviations — so the mapping lives here,
 * while the abbreviations themselves stay owned by icnconverter's `PIECE_CODES`.
 */
const ENGINE_PROMOTION_RAWTYPES: Record<string, RawType> = {
	k: r.KING, p: r.PAWN, n: r.KNIGHT, b: r.BISHOP,
	r: r.ROOK, q: r.QUEEN, m: r.AMAZON, h: r.HAWK,
	c: r.CHANCELLOR, a: r.ARCHBISHOP, g: r.GUARD, l: r.CAMEL,
	i: r.GIRAFFE, z: r.ZEBRA, e: r.CENTAUR, y: r.ROYALQUEEN,
	d: r.ROYALCENTAUR, s: r.KNIGHTRIDER, u: r.HUYGEN, o: r.ROSE,
}; // prettier-ignore

/**
 * Translates one of the engine's promotion codes into the site's ICN piece abbreviation, cased for `mover`.
 * @throws On an unknown code, which means {@link ENGINE_PROMOTION_RAWTYPES} has drifted
 * from the engine's piece list.
 */
function getPromotionAbbr(engineCode: string, mover: Player): string {
	const rawType = ENGINE_PROMOTION_RAWTYPES[engineCode.toLowerCase()];
	if (rawType === undefined) throw Error(`Unknown engine promotion code: (${engineCode})`);
	return icnposition.getAbbrFromType(typeutil.buildType(rawType, mover));
}

export { BROWSER_SUPPORTS_THREADS, THREAD_CAP, maxEngineThreads, loadEngineWasm, getPromotionAbbr };
