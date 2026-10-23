// src/server/game/cheatdetection/engineAnalysis.ts

/**
 * Hosts the one engine worker thread detection runs on, handing it one game at a time.
 * The worker starts on a request and runs until stopped; a crash replaces it on the next one.
 */

import type {
	DetectorSearch,
	EngineAnalysisReply,
	EngineAnalysisRequest,
	EngineWorkerData,
} from './cheatDetectionTypes.js';

import path from 'node:path';
import { Worker } from 'node:worker_threads';

import jsutil from '../../../shared/util/jsutil.js';
import timeutil from '../../../shared/util/timeutil.js';

import manifest from '../../config/manifest.js';

// Errors ----------------------------------------------------------------------

/**
 * Thrown by {@link analyse} when the worker can't load the engine at all, a fault of the deployed
 * build, as opposed to the worker crashing on one game.
 */
class EngineLoadError extends Error {}

// Constants -------------------------------------------------------------------

/** MultiPV 5 tells one good move from many; 300,000 nodes takes about 1.3 s per position. */
const SEARCH: DetectorSearch = { multiPv: 5, positionNodes: 300_000, hashMb: 16 };
/** Time allowed per position before a game's analysis counts as wedged: ~20× the usual. */
const POSITION_TIME_LIMIT_MS = timeutil.toMillis(30, 'seconds');

// State -----------------------------------------------------------------------

/** The live worker, resolved once it has loaded the engine. */
let worker: Promise<Worker> | undefined;

// Worker ----------------------------------------------------------------------

/** Starts the worker on the build's engine, resolving once the engine has loaded. */
function spawn(): Promise<Worker> {
	const gluePath = path.join(process.cwd(), 'dist/client', manifest.getEngineUrl());
	const wasmPath = path.join(path.dirname(gluePath), 'apeiron_bg.wasm');
	const url = new URL('./engineAnalysisWorker.js', import.meta.url);
	const instance = new Worker(url, { workerData: { gluePath, wasmPath, search: SEARCH } satisfies EngineWorkerData }); // prettier-ignore
	return new Promise((resolve, reject) => {
		instance.once('message', () => resolve(instance)); // Its first message is 'ready'.
		instance.once('error', reject);
		instance.once('exit', (code) => reject(Error(`The engine worker exited while loading (code ${code})`))); // prettier-ignore
	});
}

/**
 * Analyses every position of a stored game on the worker. Callers queue one game at a time.
 * @param plies - The game's move count, which sets how long its analysis may take.
 * @throws An {@link EngineLoadError} if the worker can't load the engine. Otherwise if the worker
 * dies or outlasts its time limit, which also discards it so the next call starts a fresh one.
 */
async function analyse(
	request: EngineAnalysisRequest,
	plies: number,
): Promise<EngineAnalysisReply> {
	let instance: Worker;
	try {
		worker ??= spawn();
		instance = await worker;
	} catch (e) {
		worker = undefined;
		throw new EngineLoadError(jsutil.getErrorMessage(e));
	}
	return new Promise((resolve, reject) => {
		const timeLimit = (plies + 1) * POSITION_TIME_LIMIT_MS;
		const onMessage = (reply: EngineAnalysisReply): void => {
			settle();
			resolve(reply);
		};
		const fail = (error: Error): void => {
			settle();
			worker = undefined;
			void instance.terminate();
			reject(error);
		};
		const onExit = (code: number): void => fail(Error(`The engine worker exited mid-game (code ${code})`)); // prettier-ignore
		const timer = setTimeout(() => fail(Error(`The engine's analysis outlasted its ${timeLimit} ms limit`)), timeLimit); // prettier-ignore
		/** Detaches every listener, so this game's outcome can't reach a later worker. */
		const settle = (): void => {
			clearTimeout(timer);
			instance.off('message', onMessage);
			instance.off('error', fail);
			instance.off('exit', onExit);
		};
		instance.on('message', onMessage);
		instance.on('error', fail);
		instance.on('exit', onExit);
		instance.postMessage(request);
	});
}

/** Terminates the worker, freeing its memory until the next request spawns another. */
function stop(): void {
	void worker?.then((instance) => instance.terminate());
	worker = undefined;
}

// Exports ---------------------------------------------------------------------

export default {
	// Errors
	EngineLoadError,
	// Constants
	SEARCH,
	// Worker
	analyse,
	stop,
};
