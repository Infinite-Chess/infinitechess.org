// scripts/cheatdetection/lib/tsxworker.js

/**
 * Runs a TypeScript worker thread under tsx: registers tsx's loader in this thread, then imports
 * the worker named in workerData.entry. Plain JavaScript because it must load before tsx does:
 * tsx passed through --import, in the parent's or the worker's own execArgv, never reaches a
 * worker's modules.
 */

import { register } from 'tsx/esm/api';
import { pathToFileURL } from 'node:url';
import { workerData } from 'node:worker_threads';

register();
await import(pathToFileURL(workerData.entry).href);
