// src/client/scripts/esm/game/chess/engines/enginewasm.ts

/** Loads an engine's wasm glue and shared-memory thread pool. */

interface EngineWasmInitOutput {
	memory: WebAssembly.Memory;
}

interface EngineWasmModule {
	default: () => Promise<EngineWasmInitOutput>;
	initThreadPool?: (threads: number) => Promise<void>;
}

/** Hard cap on Lazy SMP threads used by engine features. */
const THREAD_CAP = 4;

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

/** Returns the usable hardware-thread count after an optional reservation. */
function maxEngineThreads(cap: number, reserve: number = 0): number {
	if (!BROWSER_SUPPORTS_THREADS) return 1;
	return Math.min(cap, Math.max(1, (navigator.hardwareConcurrency || 2) - reserve));
}

/** Loads the unbundled engine glue and initializes its optional thread pool. */
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

export { BROWSER_SUPPORTS_THREADS, THREAD_CAP, maxEngineThreads, loadEngineWasm };
export type { EngineWasmModule };
