// src/client/scripts/esm/views/analysis/analysisworker.ts

/**
 * Main-thread supervisor for an analysis engine worker ({@link apeironanalysis.worker.ts}).
 *
 * Owns the lifecycle no consumer has a policy for: the `init` handshake, the shared stop-flag
 * view, and classifying a dead worker as an engine that never loaded vs. one that crashed after
 * running. Recovery stays with the consumer — ceval blacklists the position, the game review
 * requeues it, the legal-moves helper simply goes away until the next request.
 */

import type { AnalysisCommand, AnalysisResponse } from './analysisprotocol.js';

// Types -----------------------------------------------------------------------

/**
 * Why a worker died. 'unloadable' = it faulted before ever posting 'ready', so the engine glue
 * itself can't load and a respawn only repeats the failure (every worker pulls the same URL).
 * 'crashed' = it ran, then a wasm panic poisoned its module, which a fresh worker clears.
 */
export type AnalysisWorkerFault = 'unloadable' | 'crashed';

/** A supervised analysis worker. */
export interface AnalysisWorker {
	worker: Worker;
	/** Whether it has posted 'ready'. Until then it holds no engine and answers nothing. */
	ready: boolean;
	/**
	 * View over its wasm memory + the byte offset of its stop flag (arrives on 'sharedmem').
	 * Absent on a single-threaded engine build, which shares no memory. See {@link interrupt}.
	 */
	stop?: { flags: Uint8Array; ptr: number };
}

/** The engine build a {@link spawn} asks for, and where its output goes. */
interface SpawnOptions {
	/** Transposition table size, in MB. */
	hashMb: number;
	/** Lazy SMP search threads. Omit for a worker that searches single-threaded. */
	threads?: number;
	/** Every response the supervisor doesn't consume itself. */
	onMessage: (msg: AnalysisResponse) => void;
	/**
	 * The worker is already terminated by the time this fires. `reason` is the engine's error
	 * text, for the consumer to log — whether a fault is worth reporting is the consumer's call.
	 */
	onFault: (fault: AnalysisWorkerFault, reason: string) => void;
}

// Lifecycle -------------------------------------------------------------------

/** Spawns a worker against the page's engine build and posts its `init`. */
function spawn(options: SpawnOptions): AnalysisWorker {
	const entry: AnalysisWorker = {
		worker: new Worker(window.analysisPageData.engineAssets.workerUrl, { type: 'module' }),
		ready: false,
	};

	const raiseFault = (reason: string): void => {
		// Readiness is the only signal correct on every path: a worker that never
		// answered 'ready' never had an engine to crash.
		const fault: AnalysisWorkerFault = entry.ready ? 'crashed' : 'unloadable';
		terminate(entry);
		options.onFault(fault, reason);
	};

	entry.worker.onmessage = (e: MessageEvent<AnalysisResponse>): void => {
		const msg = e.data;
		switch (msg.type) {
			case 'ready':
				entry.ready = true;
				break;
			case 'sharedmem':
				entry.stop = { flags: new Uint8Array(msg.buffer), ptr: msg.stopFlagPtr };
				return; // Consumed here; no consumer acts on it.
			case 'initerror':
			case 'searcherror':
				return raiseFault(msg.message);
		}
		options.onMessage(msg);
	};
	entry.worker.onerror = (e: ErrorEvent): void => {
		// A module worker whose script can't be fetched (offline, 404) fires a blank
		// ErrorEvent — no message, no location — so don't report one that isn't there.
		if (!e.message) return raiseFault('worker script failed to load');
		raiseFault(`${e.message} @ ${e.filename}:${e.lineno}:${e.colno}`);
	};

	entry.worker.postMessage({
		cmd: 'init',
		hashMb: options.hashMb,
		engineUrl: window.analysisPageData.engineAssets.engineUrl,
		...(options.threads !== undefined && { threads: options.threads }),
	} satisfies AnalysisCommand);

	return entry;
}

/**
 * Terminates the worker and detaches its handlers, so no further message or fault
 * can be delivered from it. Safe to call on an already-terminated worker.
 */
function terminate(entry: AnalysisWorker): void {
	entry.worker.onmessage = null;
	entry.worker.onerror = null;
	entry.worker.terminate();
}

/**
 * Aborts the worker's in-flight search instantly by writing the shared stop flag, which the
 * search polls every node batch. Returns false when the engine build shares no memory to write:
 * that worker stays blocked inside its unbounded search call, so terminating is the only way out.
 */
function interrupt(entry: AnalysisWorker): boolean {
	if (!entry.stop) return false;
	entry.stop.flags[entry.stop.ptr] = 1;
	return true;
}

export default { spawn, terminate, interrupt };
