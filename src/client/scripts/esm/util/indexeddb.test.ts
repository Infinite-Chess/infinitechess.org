
// src/client/scripts/esm/util/indexeddb.test.ts

/**
 * Functional tests for the IndexedDB storage module using a simulated IDB.
 * These tests run in Node via Vitest using fake-indexeddb.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import FDBFactory from 'fake-indexeddb/lib/FDBFactory';
import FDBKeyRange from 'fake-indexeddb/lib/FDBKeyRange';

// Helper to ensure the module sees the freshly patched globals
async function loadModule(): Promise<typeof import('./indexeddb.js')> {
	// Force a fresh import so the module picks up the current globalThis.indexedDB
	vi.resetModules();
	return await import('./indexeddb.js');
}

beforeEach(() => {
	// Fresh fake IndexedDB instance each test
	// Note: assign both indexedDB and IDBKeyRange for completeness
	(globalThis as any).indexedDB = new FDBFactory();
	(globalThis as any).IDBKeyRange = FDBKeyRange;
});

describe('IndexedDB storage functional behavior', () => {
	it('saves and loads an item', async() => {
		const mod = await loadModule();

		await mod.default.saveItem('pos:1', { fen: 'start' });
		const value = await mod.default.loadItem('pos:1');

		expect(value).toEqual({ fen: 'start' });
	});

	it('overwrites an existing item with the same key', async() => {
		const mod = await loadModule();

		await mod.default.saveItem('k', 'one');
		await mod.default.saveItem('k', 'two');

		const value = await mod.default.loadItem('k');
		expect(value).toBe('two');
	});

	it('returns undefined for a missing key', async() => {
		const mod = await loadModule();

		const value = await mod.default.loadItem('missing');
		expect(value).toBeUndefined();
	});

	it('deletes an item', async() => {
		const mod = await loadModule();

		await mod.default.saveItem('x', 123);
		await mod.default.deleteItem('x');

		const value = await mod.default.loadItem('x');
		expect(value).toBeUndefined();
	});

	it('getAllKeys returns the current keys only', async() => {
		const mod = await loadModule();

		await mod.default.saveItem('a', 1);
		await mod.default.saveItem('b', 2);
		await mod.default.deleteItem('a');

		const keys = await mod.default.getAllKeys();
		expect(keys.sort()).toEqual(['b']);
	});

	it('handles concurrent writes and reads', async() => {
		const mod = await loadModule();

		const writes = Array.from({ length: 50 }, (_, i) =>
			mod.default.saveItem(`k${i}`, { v: i })
		);
		await Promise.all(writes);

		const keys = await mod.default.getAllKeys();
		const numericSorted = [...keys].sort(
			(a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1))
		);
		expect(numericSorted).toEqual(
			Array.from({ length: 50 }, (_, i) => `k${i}`)
		);

		const reads = await Promise.all([
			mod.default.loadItem('k0'),
			mod.default.loadItem('k25'),
			mod.default.loadItem('k49'),
		]);

		expect(reads).toEqual([{ v: 0 }, { v: 25 }, { v: 49 }]);
	});

	it('rejects with a clear error when IndexedDB is not supported', async() => {
		// Simulate a non-browser environment without IndexedDB
		(globalThis as any).indexedDB = undefined;

		const mod = await loadModule();

		await expect(mod.default.saveItem('a', 1))
			.rejects.toThrow('IndexedDB is not supported in this browser');

		await expect(mod.default.loadItem('a'))
			.rejects.toThrow('IndexedDB is not supported in this browser');
	});
});