// src/client/scripts/esm/views/icnvalidator/icnvalidator.cli.ts

/**
 * The ICN validator as a command. Validates a games json on every core, with the
 * movegen check and the move fingerprint, so a change to legal-move, check,
 * checkmate or game-end logic can be checked against the same games before and after.
 *
 * Usage: npm run validate-icn -- <games.json>
 *
 * Runs the movegen check against the engine package in src/client/pkg/apeiron/pkg/:
 * the release any build downloads, or a local engine build (docs/systems/ENGINE.md).
 */

import type { MovegenWasmModule } from './movegencheck.js';
import type { ChunkResults, ValidationRequest } from './icnvalidatorprotocol.js';

import fs from 'node:fs';
import os from 'node:os';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import jsutil from '../../../../../shared/util/jsutil.js';

import chunks from './chunks.js';
import chunkvalidator from './chunkvalidator.js';
import { SPRTGamesSchema } from './icnvalidatorprotocol.js';

// Types -----------------------------------------------------------------------

/** What a child process sends back to the parent. */
type ChildResponse =
	| { type: 'done'; results: ChunkResults }
	| { type: 'initerror'; message: string };

// Constants -------------------------------------------------------------------

/** The engine package the movegen check runs against. */
const ENGINE_DIR = new URL('../../../../pkg/apeiron/pkg/', import.meta.url);

// Parent Process --------------------------------------------------------------

/** Splits the games across one child process per core, then prints their merged results. */
async function runParent(gamesPath: string | undefined): Promise<void> {
	if (gamesPath === undefined) throw Error('Usage: npm run validate-icn -- <games.json>');
	const games = SPRTGamesSchema.parse(JSON.parse(fs.readFileSync(gamesPath, 'utf8')));
	const gameChunks = chunks.split(games, os.availableParallelism());

	console.log(`Validating ${games.length} games on ${gameChunks.length} processes...`);
	const startTime = performance.now();
	const results = chunks.createResults();
	for (const chunk of await Promise.all(gameChunks.map((chunk) => runChild(chunk)))) {
		chunks.mergeResults(results, chunk);
	}
	printResults(results, games.length, performance.now() - startTime);
	if (results.successfulCount < games.length) process.exitCode = 1;
}

/** Validates one chunk in a child process, resolving with its tallies. */
function runChild(games: ValidationRequest['games']): Promise<ChunkResults> {
	return new Promise((resolve, reject) => {
		const child = fork(fileURLToPath(import.meta.url));
		child.on('message', (response: ChildResponse) => {
			if (response.type === 'done') resolve(response.results);
			else reject(Error(response.message));
		});
		child.on('exit', (code) => {
			if (code !== 0) reject(Error(`A child process exited with code ${code}`));
		});
		child.send(games);
	});
}

/** Prints every failed game, the tallies, and the fingerprint. */
function printResults(results: ChunkResults, total: number, ms: number): void {
	results.errors.sort((a, b) => a.gameIndex - b.gameIndex);
	for (const { gameIndex, variant, phase, error } of results.errors) {
		console.log(`Game #${gameIndex} (${variant ?? 'unknown variant'}) ${phase}: ${error}`);
	}
	console.log(`
${results.successfulCount} / ${total} games passed in ${(ms / 1000).toFixed(0)} s
Failures: ICN ${results.icnconverterErrors} | formulator ${results.formulatorErrors} | illegal move ${results.illegalMoveErrors} | movegen ${results.movegenMismatchErrors} | termination ${results.terminationMismatchErrors}
Fingerprint: ${results.fingerprint}`);
}

// Child Process ---------------------------------------------------------------

/** Loads the engine, validates the chunk of games the parent sends, and replies with its tallies. */
function runChildProcess(send: (response: ChildResponse) => void): void {
	process.once('message', async (games: ValidationRequest['games']) => {
		let wasm: MovegenWasmModule;
		try {
			wasm = await loadEngine();
		} catch (error) {
			send({ type: 'initerror', message: jsutil.getErrorMessage(error) });
			process.disconnect();
			return;
		}
		const results = await chunkvalidator.validate(games, { wasm, fingerprint: true }, () => {});
		send({ type: 'done', results });
		process.disconnect();
	});
}

/** Loads the engine package from its files, single-threaded. */
async function loadEngine(): Promise<MovegenWasmModule> {
	if (!fs.existsSync(ENGINE_DIR))
		throw Error('No engine package at src/client/pkg/apeiron/pkg/. Download it with `npm run setup:engine`.'); // prettier-ignore
	Object.assign(globalThis, { name: 'main' }); // wasm-bindgen-rayon's worker helper reads the worker global `name` on import
	const wasm = (await import(new URL('apeiron.js', ENGINE_DIR).href)) as MovegenWasmModule;
	await wasm.default({ module_or_path: fs.readFileSync(new URL('apeiron_bg.wasm', ENGINE_DIR)) });
	return wasm;
}

// Entry -----------------------------------------------------------------------

const sendToParent = process.send?.bind(process);
if (sendToParent) runChildProcess((response) => sendToParent(response));
else await runParent(process.argv[2]);
