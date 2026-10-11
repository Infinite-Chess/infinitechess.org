// src/client/scripts/esm/views/icnvalidator/icnvalidator.cli.ts

/**
 * The ICN validator as a command. Validates a games json on every core, with the
 * movegen check and the fingerprint, so a change to legal-move, check, checkmate or
 * game-end logic can be checked against the same games before and after.
 *
 * Usage: npm run validate-icn -- <games.json> [--conclusions]
 *
 * --conclusions skips the movegen check and fingerprints only each game's outcome,
 * enough for a change to game-end logic alone, in a fraction of the time. Otherwise it
 * runs the movegen check against the engine package in src/client/pkg/apeiron/pkg/:
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

/** What the parent sends a child process. */
type ChildRequest = { games: ValidationRequest['games']; conclusionsOnly: boolean };

/** What a child process sends back to the parent. */
type ChildResponse =
	| { type: 'done'; results: ChunkResults }
	| { type: 'initerror'; message: string };

// Constants -------------------------------------------------------------------

/** The engine package the movegen check runs against. */
const ENGINE_DIR = new URL('../../../../pkg/apeiron/pkg/', import.meta.url);

// Parent Process --------------------------------------------------------------

/** Splits the games across one child process per core, then prints their merged results. */
async function runParent(args: string[]): Promise<void> {
	const [gamesPath, flag] = args;
	if (gamesPath === undefined || (flag !== undefined && flag !== '--conclusions'))
		throw Error('Usage: npm run validate-icn -- <games.json> [--conclusions]');
	const conclusionsOnly = flag === '--conclusions';
	const games = SPRTGamesSchema.parse(JSON.parse(fs.readFileSync(gamesPath, 'utf8')));
	const gameChunks = chunks.split(games, os.availableParallelism());

	console.log(`Validating ${games.length} games on ${gameChunks.length} processes...`);
	const startTime = performance.now();
	const results = chunks.createResults();
	const requests = gameChunks.map((chunk) => runChild({ games: chunk, conclusionsOnly }));
	for (const chunk of await Promise.all(requests)) {
		chunks.mergeResults(results, chunk);
	}
	printResults(results, games.length, performance.now() - startTime, conclusionsOnly);
	if (results.successfulCount < games.length) process.exitCode = 1;
}

/** Validates one chunk in a child process, resolving with its tallies. */
function runChild(request: ChildRequest): Promise<ChunkResults> {
	return new Promise((resolve, reject) => {
		const child = fork(fileURLToPath(import.meta.url));
		child.on('message', (response: ChildResponse) => {
			if (response.type === 'done') resolve(response.results);
			else reject(Error(response.message));
		});
		child.on('exit', (code) => {
			if (code !== 0) reject(Error(`A child process exited with code ${code}`));
		});
		child.send(request);
	});
}

/** Prints every failed game, the tallies, and the fingerprint, labelled by its kind. */
function printResults(
	results: ChunkResults,
	total: number,
	ms: number,
	conclusionsOnly: boolean,
): void {
	results.errors.sort((a, b) => a.gameIndex - b.gameIndex);
	for (const { gameIndex, variant, phase, error } of results.errors) {
		console.log(`Game #${gameIndex} (${variant ?? 'unknown variant'}) ${phase}: ${error}`);
	}
	console.log(`
${results.successfulCount} / ${total} games passed in ${(ms / 1000).toFixed(0)} s
Failures: ICN ${results.icnconverterErrors} | formulator ${results.formulatorErrors} | illegal move ${results.illegalMoveErrors} | movegen ${results.movegenMismatchErrors} | termination ${results.terminationMismatchErrors}
Fingerprint${conclusionsOnly ? ' (conclusions only)' : ''}: ${results.fingerprint}`);
}

// Child Process ---------------------------------------------------------------

/**
 * Loads the engine if needed, validates the chunk of games the parent sends, and replies with
 * its tallies.
 */
function runChildProcess(reply: (response: ChildResponse) => void): void {
	process.once('message', async ({ games, conclusionsOnly }: ChildRequest) => {
		let wasm: MovegenWasmModule | undefined;
		try {
			if (!conclusionsOnly) wasm = await loadEngine();
		} catch (error) {
			reply({ type: 'initerror', message: jsutil.getErrorMessage(error) });
			return;
		}
		const fingerprint = conclusionsOnly ? 'conclusions' : 'full';
		const results = await chunkvalidator.validate(games, { wasm, fingerprint }, () => {});
		reply({ type: 'done', results });
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
// Disconnects only once the reply is sent: disconnecting first can drop a large one, leaving the parent waiting.
if (sendToParent)
	runChildProcess((response) => sendToParent(response, undefined, undefined, () => process.disconnect())); // prettier-ignore
else await runParent(process.argv.slice(2));
