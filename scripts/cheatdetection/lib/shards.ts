// scripts/cheatdetection/lib/shards.ts

/**
 * Splits a research script over processes, one per core: with `--shards=N` the script re-runs
 * itself as N children, each given `--shard=i/N` and logging to the data directory.
 */

import path from 'node:path';
import { spawn } from 'node:child_process';
import { createWriteStream, mkdirSync } from 'node:fs';

import settings from './settings.js';

// Shards ----------------------------------------------------------------------

/** How many processes `--shards=N` asks for; 1 when not given. */
function requested(): number {
	return Number(settings.flag('shards') ?? 1);
}

/** Whether this process is one shard of a split run. */
function isChild(): boolean {
	return settings.flag('shard') !== undefined;
}

/** This process's shard, from `--shard=i/n`, as [i, n]; [0, 1] when unsplit. */
function current(): [number, number] {
	const [index = 0, count = 1] = settings.flag('shard')?.split('/').map(Number) ?? [];
	return [index, count];
}

/** Re-runs this script as `shards` child processes, each logging to `logs/<name>-<shard>.log`. */
async function run(name: string, shards: number): Promise<void> {
	const logs = path.join(settings.DATA_DIR, 'logs');
	mkdirSync(logs, { recursive: true });
	const args = process.argv.slice(1).filter((arg) => !arg.startsWith('--shards='));
	await Promise.all(
		Array.from({ length: shards }, (_, shard) => {
			const child = spawn(process.execPath, [...process.execArgv, ...args, `--shard=${shard}/${shards}`]); // prettier-ignore
			const log = createWriteStream(path.join(logs, `${name}-${shard}.log`));
			child.stdout.pipe(log);
			child.stderr.pipe(log);
			return new Promise((resolve) => child.on('exit', resolve));
		}),
	);
}

// Exports ---------------------------------------------------------------------

export default {
	requested,
	isChild,
	current,
	run,
};
