// scripts/cheatdetection/lib/detectorworker.ts

/**
 * The production engine worker (engineAnalysisWorker.ts) run under tsx on the client package's
 * engine build, with the experiment's search settings, so the research's detector evidence always
 * comes from shipping code.
 */

import type {
	EngineAnalysisReply,
	EngineAnalysisRequest,
} from '../../../src/server/game/cheatdetection/cheatDetectionTypes.js';

import path from 'node:path';
import { Worker } from 'node:worker_threads';

import settings from './settings.js';

// Worker ----------------------------------------------------------------------

/** Starts the worker, resolving once its engine has loaded. */
async function start(): Promise<Worker> {
	const worker = new Worker(path.resolve('scripts/cheatdetection/lib/tsxworker.js'), {
		workerData: {
			entry: path.resolve('src/server/game/cheatdetection/engineAnalysisWorker.ts'),
			gluePath: path.join(settings.ENGINE_PKG, 'apeiron.js'),
			wasmPath: path.join(settings.ENGINE_PKG, 'apeiron_bg.wasm'),
			search: settings.SEARCH,
		},
	});
	await new Promise((resolve) => worker.once('message', resolve)); // Its first message is 'ready'.
	return worker;
}

/** Analyses every position of one stored game on the worker. */
function analyse(worker: Worker, request: EngineAnalysisRequest): Promise<EngineAnalysisReply> {
	return new Promise((resolve) => {
		worker.once('message', resolve);
		worker.postMessage(request);
	});
}

// Exports ---------------------------------------------------------------------

export default {
	start,
	analyse,
};
