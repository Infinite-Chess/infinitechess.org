// src/tests/testsGlobalSetup.ts

/**
 * Runs once in Vitest's main process, before any test process starts.
 */

/** Creates `.env` if missing, before the parallel test processes could race to write it. */
export async function setup(): Promise<void> {
	await import('../server/config/env.js');
}
