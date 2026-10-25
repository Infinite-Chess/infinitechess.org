// src/client/scripts/chess/enginewasm.ts

/**
 * Loads an engine's wasm glue and shared-memory thread pool.
 */

import type {
	EngineWasmInitOutput,
	EngineWasmModule,
} from '../../../shared/chess/util/engineglue.js';

import math from '../../../shared/util/math/math.js';

// Wasm Loading ----------------------------------------------------------------

/** Most Lazy SMP threads an engine feature uses without the user choosing more. */
const DEFAULT_THREAD_CAP = 4;
/** The engine's own thread cap, the most its 512 MB memory fits beside a 64 MB hash. */
const MAX_THREAD_CAP = 20;

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
async function load<T extends EngineWasmModule>(
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

/** Returns {@link maxThreads}, capped for features that pick the thread count on the user's behalf. */
function defaultThreads(reserve: number = 0): number {
	return Math.min(maxThreads(reserve), DEFAULT_THREAD_CAP);
}

/** Returns the usable hardware-thread count after an optional reservation, up to the engine's cap. */
function maxThreads(reserve: number = 0): number {
	if (!BROWSER_SUPPORTS_THREADS) return 1;
	return math.clamp((navigator.hardwareConcurrency || 2) - reserve, 1, MAX_THREAD_CAP);
}

// Exports ---------------------------------------------------------------------

export default {
	load,
	defaultThreads,
	maxThreads,
};
